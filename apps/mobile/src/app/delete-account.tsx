import { Redirect, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Loading } from '../components/RemoteContent';
import { Body, Button, ErrorText, Muted, Screen, TextField } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { translate } from '../i18n/messages';
import { ActionSlot } from '../lib/api';
import { confirmWordMatches, deleteOutcome } from '../lib/deleteAccount';
import { useSession } from '../lib/session';
import { type } from '../theme/fonts';
import { space } from '../theme/tokens';

interface DeletedAccount {
  memberIds: string[];
  codesCancelled: number;
  authUserDeleted: boolean;
}

/** Either language's word confirms (a Greek member may be on a Latin keyboard). */
const confirmWords = [translate('el', 'delete.confirmWord'), translate('en', 'delete.confirmWord')];

/**
 * Profile → Delete account (copy deck §b6): what is erased and kept, type
 * ΔΙΑΓΡΑΦΗ / DELETE, then `POST account/delete`. On success the app signs out
 * on this device and shows `delete.done`. ("Download your data" is not built
 * yet, so `delete.exportFirst` is not shown.)
 */
export default function DeleteAccountScreen() {
  const { auth, member, api, signOut, errorText } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // One user action = one idempotency key, reused when "Delete for good" is tapped again after an error.
  const slot = useMemo(() => (api ? new ActionSlot<DeletedAccount>(() => api) : null), [api]);
  const unclear = useRef(false);

  if (done) {
    return (
      <Screen title={t('profile.delete')}>
        <View style={styles.done} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={[type.heading, styles.center]}>
            {t('delete.done')}
          </Text>
        </View>
        <Button label={t('common.close')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  if (auth.status === 'signed_out' || auth.status === 'not_configured' || member.status === 'none') {
    return <Redirect href="/profile" />;
  }
  if (member.status !== 'ready') {
    return (
      <Screen title={t('profile.delete')}>
        <Loading />
      </Screen>
    );
  }

  const confirmed = confirmWordMatches(typed, confirmWords);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const submit = async () => {
    if (!slot || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    const result = await slot.send('account/delete', { confirm: true });
    const outcome = deleteOutcome(result, unclear.current);
    if (outcome === 'deleted') {
      // Show "done" first: signing out would otherwise send this screen back to Profile.
      setDone(true);
      setBusy(false);
      await signOut();
      return;
    }
    if (outcome === 'retry') unclear.current = true;
    setBusy(false);
    setError(result.ok ? null : errorText(result.code));
  };

  return (
    <Screen title={t('profile.delete')}>
      <Text accessibilityRole="header" style={type.title}>
        {t('delete.title')}
      </Text>
      <Body>{t('delete.body')}</Body>
      <Muted>{t('delete.keep')}</Muted>
      <TextField
        label={t('delete.confirmLabel')}
        value={typed}
        onChangeText={(value) => {
          setTyped(value);
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!busy}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      {error ? <ErrorText message={error} /> : null}
      <View style={styles.actions}>
        <Button label={t('delete.confirm')} onPress={submit} disabled={!confirmed} loading={busy} />
        <Button label={t('delete.cancel')} variant="outline" onPress={back} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm, marginTop: space.sm },
  done: { gap: space.md, paddingVertical: space.lg },
  center: { textAlign: 'center' },
});
