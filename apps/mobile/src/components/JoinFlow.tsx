import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { ActionSlot } from '../lib/api';
import { fetchStoreByCode } from '../lib/data';
import { formatPoints } from '../lib/format';
import {
  authProblem,
  isValidEmail,
  isValidOtp,
  joinBody,
  normalizeOtp,
  profileProblems,
  RESEND_SECONDS,
  type AuthProblem,
  type ProfileProblem,
} from '../lib/joinForm';
import { useSession } from '../lib/session';
import { getSupabase } from '../lib/supabase';
import { useNow } from '../lib/useNow';
import { type } from '../theme/fonts';
import { colors, space } from '../theme/tokens';
import { Icon } from './Icon';
import { StepNumber } from './Landing';
import { Logo } from './Logo';
import { LanguageToggle, PinkHeader } from './PinkHeader';
import { Loading, NotConfigured } from './RemoteContent';
import { Body, Button, Card, Checkbox, ErrorText, LinkButton, Muted, Screen, Tag, TextField, Title } from './ui';

type Step = 'start' | 'email' | 'code' | 'profile' | 'consents' | 'welcome';
export type Mode = 'join' | 'signin';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type AuthError = { status?: number; code?: string; name?: string };
const offline = (e: unknown) => ({ error: { name: 'AuthRetryableFetchError', status: 0, message: String(e) } });

/**
 * Join and sign in (copy deck §a). The counter QR opens /join?store=<code>
 * (native: overollclub://join?store=<code>); /sign-in starts at the email
 * step. Email one-time code with Supabase Auth, then (first time only) name,
 * age, consents and POST join. The first render depends only on the route,
 * never on query parameters, so it matches the static web HTML.
 */
export function JoinFlow({ initialMode }: { initialMode: Mode }) {
  const params = useLocalSearchParams<{ store?: string }>();
  const storeCode = firstParam(params.store)?.toLowerCase() ?? null;
  const { t, locale } = useI18n();
  const router = useRouter();
  const { auth, member, config, api, refresh, errorText } = useSession();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>(initialMode === 'signin' ? 'email' : 'start');
  const [storeName, setStoreName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [consents, setConsents] = useState({ email: false, sms: false, push: false });
  const [problems, setProblems] = useState<ProfileProblem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const now = useNow(step === 'code' ? 1000 : 60_000);
  const joinSlot = useMemo(() => (api ? new ActionSlot<{ memberId: string }>(() => api) : null), [api]);
  const configured = auth.status !== 'not_configured';

  // Greet with the store from the counter QR, if it is an active store.
  useEffect(() => {
    const client = getSupabase();
    if (!client || !storeCode) return;
    let cancelled = false;
    fetchStoreByCode(client, storeCode)
      .then((store) => !cancelled && setStoreName(store?.name ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeCode]);

  // Signed in but not a member yet (new, or came back later): ask for the details.
  useEffect(() => {
    if (auth.status === 'signed_in' && member.status === 'none' && (step === 'start' || step === 'email' || step === 'code')) {
      setError(null);
      setStep('profile');
    }
  }, [auth.status, member.status, step]);

  // Members go straight to their card.
  if (auth.status === 'signed_in' && member.status === 'ready' && step !== 'welcome') return <Redirect href="/" />;

  const authMessage = (problem: AuthProblem) =>
    problem === 'tooMany'
      ? t('join.code.tooMany')
      : problem === 'network'
        ? errorText('network_error')
        : problem === 'invalidEmail'
          ? t('join.email.invalid')
          : problem === 'wrongCode'
            ? t('join.code.wrong')
            : errorText('unknown');

  const sendCode = async () => {
    const client = getSupabase();
    if (!client) return;
    const address = email.trim();
    if (!isValidEmail(address)) {
      setError(t('join.email.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: problem } = await client.auth
      .signInWithOtp({ email: address, options: { shouldCreateUser: true } })
      .catch(offline);
    setBusy(false);
    if (problem) {
      setError(authMessage(authProblem(problem as AuthError)));
      return;
    }
    setCode('');
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setStep('code');
  };

  const verify = async () => {
    const client = getSupabase();
    if (!client) return;
    const token = normalizeOtp(code);
    if (!isValidOtp(token)) {
      setError(t('join.code.wrong'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: problem } = await client.auth.verifyOtp({ email: email.trim(), token, type: 'email' }).catch(offline);
    setBusy(false);
    if (problem) setError(authMessage(authProblem(problem as AuthError)));
    // Success: the session arrives through onAuthStateChange; the member
    // lookup then sends a member to the card and a new user to `profile`.
  };

  const continueProfile = () => {
    const found = profileProblems({ firstName, ageConfirmed }, new Date(), config);
    setProblems(found);
    if (found.length === 0) {
      setError(null);
      setStep('consents');
    }
  };

  const submitJoin = async () => {
    if (!joinSlot || auth.status !== 'signed_in') return;
    setBusy(true);
    setError(null);
    const result = await joinSlot.send(
      'join',
      joinBody({
        firstName,
        email: auth.session.user.email ?? (email.trim() || null),
        locale,
        storeCode: storeName ? storeCode : null,
        consents: { ...consents, push: Platform.OS !== 'web' && consents.push },
      }),
    );
    if (!result.ok) {
      setBusy(false);
      setError(errorText(result.code));
      return;
    }
    setStep('welcome');
    await refresh();
    setBusy(false);
  };

  const greeting = storeName ? t('join.hero.storeHello', { store: storeName }) : null;

  if (step === 'start') {
    return (
      <Screen title={t('join.hero.cta')} header={<PinkHeader kicker={greeting} title={t('join.hero.title')} />} gap={space.mdl}>
        <Text style={type.lead}>{t('join.hero.intro')}</Text>

        <Card style={styles.giftCard}>
          <View style={styles.giftIcon}>
            <Icon name="croissant" size={24} color={colors.ink} />
          </View>
          <View style={styles.giftText}>
            <Tag tone="plum" label={t('rewards.welcome.badge')} />
            <Text style={[type.bodyStrong, { marginTop: 6 }]}>{t('join.hero.gift')}</Text>
          </View>
        </Card>

        <View style={styles.steps} accessibilityLabel={t('landing.how.title')}>
          {(['join.hero.step1', 'join.hero.step2', 'join.hero.step3'] as const).map((key, i) => (
            <View key={key} style={styles.stepRow}>
              <StepNumber n={i + 1} />
              <Body style={styles.stepText}>{t(key, { points: formatPoints(config.pointsPerEuro, locale) })}</Body>
            </View>
          ))}
        </View>

        {!configured ? <NotConfigured /> : null}

        <View style={styles.bottom}>
          <Button
            label={t('join.hero.cta')}
            disabled={!configured}
            onPress={() => {
              setMode('join');
              setStep('email');
            }}
          />
          <LinkButton
            label={t('join.hero.signIn')}
            onPress={() => {
              setMode('signin');
              setStep('email');
            }}
          />
          <Muted style={styles.center}>{t('join.hero.noApp')}</Muted>
        </View>
      </Screen>
    );
  }

  const topBar = (
    <View style={styles.topBar}>
      <Logo variant="wordmark" width={96} />
      <LanguageToggle />
    </View>
  );

  if (!configured) {
    return (
      <Screen title={t('join.hero.cta')}>
        {topBar}
        <NotConfigured />
      </Screen>
    );
  }

  if (step === 'email') {
    const title = mode === 'signin' ? t('auth.signIn.title') : t('join.hero.cta');
    return (
      <Screen title={title} gap={space.mdl}>
        {topBar}
        <Title>{title}</Title>
        <Body>{mode === 'signin' ? t('auth.signIn.body') : t('join.method.body')}</Body>
        <TextField
          label={t('join.email.label')}
          placeholder={t('join.email.placeholder')}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          error={error}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={sendCode}
          editable={!busy}
        />
        <Button label={t('join.send')} onPress={sendCode} loading={busy} />
        {mode === 'join' ? <Muted>{t('join.hero.noApp')}</Muted> : null}
      </Screen>
    );
  }

  if (step === 'code') {
    const waitSeconds = Math.max(0, Math.ceil((resendAt - now.getTime()) / 1000));
    const verifying = auth.status === 'signed_in' && member.status === 'loading';
    return (
      <Screen title={t('join.code.label')} gap={space.mdl}>
        {topBar}
        <Title>{t('join.code.titleEmail', { email: email.trim() })}</Title>
        {verifying ? (
          <Loading />
        ) : (
          <>
            <TextField
              label={t('join.code.label')}
              value={code}
              onChangeText={(text) => {
                setCode(normalizeOtp(text));
                setError(null);
              }}
              error={error}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={verify}
              editable={!busy}
            />
            <Button label={t('join.code.submit')} onPress={verify} loading={busy} />
            <Muted>{t('join.code.spam')}</Muted>
            {waitSeconds > 0 ? (
              <Muted style={styles.center}>{t('join.code.resendIn', { seconds: waitSeconds })}</Muted>
            ) : (
              <LinkButton label={t('join.code.resend')} onPress={sendCode} />
            )}
            <LinkButton
              label={t('join.code.change')}
              onPress={() => {
                setError(null);
                setStep('email');
              }}
            />
          </>
        )}
      </Screen>
    );
  }

  if (step === 'profile') {
    return (
      <Screen title={t('join.profile.title')} gap={space.mdl}>
        {topBar}
        <Title>{t('join.profile.title')}</Title>
        <TextField
          label={t('join.profile.firstName')}
          hint={t('join.profile.firstNameHint')}
          value={firstName}
          onChangeText={(text) => {
            setFirstName(text);
            setProblems((p) => p.filter((x) => x !== 'firstName'));
          }}
          error={problems.includes('firstName') ? t('join.profile.firstNameMissing') : null}
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          maxLength={50}
          returnKeyType="next"
        />
        <View style={styles.checkBlock}>
          <Checkbox
            label={t('join.profile.age', { age: config.minimumAge })}
            checked={ageConfirmed}
            onChange={(next) => {
              setAgeConfirmed(next);
              if (next) setProblems((p) => p.filter((x) => x !== 'age'));
            }}
          />
          {problems.includes('age') ? <ErrorText message={t('join.profile.ageMissing', { age: config.minimumAge })} /> : null}
        </View>
        <Button label={t('join.profile.continue')} onPress={continueProfile} style={styles.bottom} />
      </Screen>
    );
  }

  if (step === 'consents') {
    return (
      <Screen title={t('join.consents.title')} gap={space.mdl}>
        {topBar}
        <Title>{t('join.consents.title')}</Title>
        <Body>{t('join.consents.body')}</Body>
        {/* Three separate, optional, unticked choices (GDPR); none is needed to join. */}
        <View style={styles.checkBlock}>
          <Checkbox label={t('join.consents.email')} checked={consents.email} onChange={(v) => setConsents((c) => ({ ...c, email: v }))} />
          <Checkbox label={t('join.consents.sms')} checked={consents.sms} onChange={(v) => setConsents((c) => ({ ...c, sms: v }))} />
          {/* Push only where the app can send it (native); the OS prompt comes with notifications. */}
          {Platform.OS !== 'web' ? (
            <Checkbox label={t('join.consents.push')} checked={consents.push} onChange={(v) => setConsents((c) => ({ ...c, push: v }))} />
          ) : null}
        </View>
        <Muted>{t('join.consents.terms')}</Muted>
        {error ? <ErrorText message={error} /> : null}
        <Button label={t('join.consents.submit')} onPress={submitJoin} loading={busy} style={styles.bottom} />
      </Screen>
    );
  }

  // welcome
  return (
    <Screen title={t('join.welcome.title')} gap={space.mdl}>
      {topBar}
      <Title>{t('join.welcome.title')}</Title>
      <Body>{t('join.welcome.body')}</Body>
      <Card style={styles.giftCard}>
        <View style={styles.giftIcon}>
          <Icon name="croissant" size={24} color={colors.ink} />
        </View>
        <Text style={[type.bodyStrong, styles.giftText]}>{t('join.welcome.croissant')}</Text>
      </Card>
      <Muted>{t('join.welcome.wallet')}</Muted>
      <Button label={t('join.welcome.cta')} onPress={() => router.replace('/')} loading={busy} style={styles.bottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  giftCard: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.mdl },
  giftIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  giftText: { flex: 1, gap: 2 },
  steps: { gap: space.ms },
  stepRow: { flexDirection: 'row', gap: space.ms, alignItems: 'center' },
  stepText: { flex: 1 },
  bottom: { marginTop: 'auto', gap: 14 },
  center: { textAlign: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkBlock: { gap: space.xs },
});
