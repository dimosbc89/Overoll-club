import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../i18n/I18nProvider';
import { formatDayMonth, formatPoints } from '../../lib/format';
import type { MemberBundle } from '../../lib/data';
import { nextTierView } from '../../lib/memberView';
import { useSession } from '../../lib/session';
import { getSupabase } from '../../lib/supabase';
import { tierName } from '../../lib/tiers';
import { AppScreen, TitleRow } from '../chrome';
import { c, radius, raised, space, t } from '../theme';
import { ErrorText, Group, Progress, SettingsRow, TierSticker } from '../ui';

type Consents = { consent_email: boolean; consent_sms: boolean; consent_push: boolean };
type ConsentKey = keyof Consents;

/** Προφίλ (Figma App · 08 Profile, 09 scrolled). */
export function ProfileScreen({ bundle }: { bundle: MemberBundle }) {
  const { t: tr, locale, setLocale } = useI18n();
  const router = useRouter();
  const { signOut, errorText } = useSession();
  const { member, balance } = bundle;
  const config = bundle.brand.config;
  const nextTier = nextTierView(member.tier, balance.earned_12m, config);
  const [consents, setConsents] = useState<Consents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Contact choices: the member's own row (row-level security lets them change these three).
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let cancelled = false;
    client
      .from('members')
      .select('consent_email, consent_sms, consent_push')
      .eq('id', member.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setConsents(data as Consents);
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const toggle = useCallback(
    async (key: ConsentKey) => {
      const client = getSupabase();
      if (!client || !consents) return;
      const next = { ...consents, [key]: !consents[key] };
      setConsents(next);
      setError(null);
      const { error: problem } = await client.from('members').update({ [key]: next[key] }).eq('id', member.id);
      if (problem) {
        setConsents(consents);
        setError(errorText('unknown'));
      }
    },
    [consents, member.id, errorText],
  );

  const download = async () => {
    const client = getSupabase();
    if (!client || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const text = await myData(client, member.id);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'my-data.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        await Share.share({ message: text, title: tr('v2.profile.download') });
      }
    } catch {
      setError(errorText('unknown'));
    } finally {
      setExporting(false);
    }
  };

  const anniversary = formatDayMonth(member.created_at, locale);

  return (
    <AppScreen title={tr('profile.title')} gap={space[16]}>
      <View>
        <TitleRow title={tr('profile.title')} />
        <Text style={t.title}>{member.first_name}</Text>
        <Text style={t.bodyS}>{tr('profile.memberSince', { date: anniversary })}</Text>
      </View>

      <View style={styles.tierCard}>
        <TierSticker tier={member.tier} label={tierName(tr, member.tier)} style={{ marginLeft: -4 }} />
        {nextTier.kind === 'progress' ? (
          <Progress
            title={tr('card.nextTier', { points: formatPoints(nextTier.pointsToNext, locale), tier: tierName(tr, nextTier.next) })}
            value={nextTier.earned}
            max={nextTier.threshold}
            fill="brand"
            start={`${tierName(tr, member.tier)} · ${formatPoints(nextTier.earned, locale)}`}
            end={`${tierName(tr, nextTier.next)} · ${formatPoints(nextTier.threshold, locale)}`}
            a11y={tr('card.nextTier.a11y')}
          />
        ) : (
          <Text style={t.bodyMStrong}>{tr('card.topTier')}</Text>
        )}
        <Text style={t.bodyS}>{tr('v2.profile.tierReview', { date: anniversary })}</Text>
      </View>

      <Group>
        <SettingsRow icon="history" label={tr('v2.profile.history')} onPress={() => router.push('/history')} />
      </Group>

      <Group title={tr('v2.profile.details')}>
        <SettingsRow icon="user" label={tr('profile.name')} value={member.first_name} />
        {member.email ? <SettingsRow icon="mail" label={tr('profile.email')} value={member.email} /> : null}
        <SettingsRow
          icon="globe"
          label={tr('profile.language')}
          value={tr(locale === 'el' ? 'language.el' : 'language.en')}
          hint={tr('v2.profile.languageHint')}
          onPress={() => setLocale(locale === 'el' ? 'en' : 'el')}
        />
      </Group>

      <Group title={tr('v2.profile.contact')}>
        <SettingsRow icon="mail" label={tr('v2.profile.consentEmail')} toggle={!!consents?.consent_email} disabled={!consents} onPress={() => toggle('consent_email')} />
        <SettingsRow icon="sms" label={tr('v2.profile.consentSms')} toggle={!!consents?.consent_sms} disabled={!consents} onPress={() => toggle('consent_sms')} />
        {Platform.OS !== 'web' ? (
          <SettingsRow icon="bell" label={tr('v2.profile.consentPush')} toggle={!!consents?.consent_push} disabled={!consents} onPress={() => toggle('consent_push')} />
        ) : null}
      </Group>
      {error ? <ErrorText message={error} /> : null}

      <Group title={tr('v2.profile.help')}>
        <SettingsRow icon="help" label={tr('support.title')} onPress={() => router.push('/support')} />
        <SettingsRow icon="doc" label={tr('legal.terms.title')} onPress={() => router.push('/terms')} />
        <SettingsRow icon="shield" label={tr('legal.privacy.title')} onPress={() => router.push('/privacy')} />
        <SettingsRow icon="download" label={tr('v2.profile.download')} disabled={exporting} onPress={download} />
      </Group>

      <Group>
        <SettingsRow
          icon="logout"
          label={tr('profile.signOut')}
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
        <SettingsRow icon="trash" label={tr('profile.delete')} danger onPress={() => router.push('/delete-account')} />
      </Group>
    </AppScreen>
  );
}

/** A copy of the member's own data (GDPR access): profile, points history, codes, gifts. Reads only. */
async function myData(client: SupabaseClient, memberId: string): Promise<string> {
  const [member, ledger, redemptions, gifts] = await Promise.all([
    client
      .from('members')
      .select('*')
      .eq('id', memberId)
      .maybeSingle(),
    client.from('ledger_entries').select('kind, points, amount_cents, created_at').eq('member_id', memberId).order('created_at'),
    client.from('redemptions').select('code, points_spent, status, created_at, expires_at').eq('member_id', memberId).order('created_at'),
    client.from('member_gifts').select('kind, status, unlocked_at, expires_at').eq('member_id', memberId),
  ]);
  for (const r of [member, ledger, redemptions, gifts]) if (r.error) throw r.error;
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), member: member.data, points: ledger.data, redemptions: redemptions.data, gifts: gifts.data },
    null,
    2,
  );
}

const styles = StyleSheet.create({
  tierCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 18, gap: space[12], ...raised(4) },
});
