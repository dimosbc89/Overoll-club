import { Link, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { brand } from '../../brand';
import { Loading, NotConfigured } from '../../components/RemoteContent';
import { useI18n } from '../../i18n/I18nProvider';
import { ActionSlot } from '../../lib/api';
import { fetchStoreByCode } from '../../lib/data';
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
} from '../../lib/joinForm';
import { showsWalletCopy, walletButtons } from '../../lib/platformFeatures';
import { useSession } from '../../lib/session';
import { inLocale } from '../../lib/storeNames';
import { getSupabase } from '../../lib/supabase';
import { tierName } from '../../lib/tiers';
import { useNow } from '../../lib/useNow';
import { qr } from '../../theme/tokens';
import { FlowScreen } from '../chrome';
import { c, radius, raised, space, t } from '../theme';
import { Button, Checkbox, ErrorText, GiftBanner, Icon, Illo, Lockup, OtpField, TextField, TierSticker } from '../ui';

type Step = 'email' | 'code' | 'details' | 'welcome';
export type Mode = 'join' | 'signin';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type AuthError = { status?: number; code?: string; name?: string };
const offline = (e: unknown) => ({ error: { name: 'AuthRetryableFetchError', status: 0, message: String(e) } });

/**
 * Sign-up and sign-in (Figma Onboarding · 05–10): email → one-time code →
 * (first time) name, age and contact choices → welcome. The counter QR opens
 * /join?store=<code> and greets with the store. Same rules as the classic
 * JoinFlow (API contract: join; v0.8 review code).
 */
export function JoinScreen({ initialMode }: { initialMode: Mode }) {
  const params = useLocalSearchParams<{ store?: string }>();
  const storeCode = firstParam(params.store)?.toLowerCase() ?? null;
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { auth, member, config, api, refresh, errorText } = useSession();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>('email');
  const [store, setStore] = useState<{ name: string; name_en: string | null } | null>(null);
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

  useEffect(() => {
    const client = getSupabase();
    if (!client || !storeCode) return;
    let cancelled = false;
    fetchStoreByCode(client, storeCode)
      .then((found) => !cancelled && setStore(found))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeCode]);

  useEffect(() => {
    if (auth.status === 'signed_in' && member.status === 'none' && (step === 'email' || step === 'code')) {
      setError(null);
      setStep('details');
    }
  }, [auth.status, member.status, step]);

  if (auth.status === 'signed_in' && member.status === 'ready' && step !== 'welcome') return <Redirect href="/" />;

  const authMessage = (problem: AuthProblem) =>
    problem === 'tooMany'
      ? tr('join.code.tooMany')
      : problem === 'network'
        ? errorText('network_error')
        : problem === 'invalidEmail'
          ? tr('join.email.invalid')
          : problem === 'wrongCode'
            ? tr('join.code.wrong')
            : errorText('unknown');

  const sendCode = async () => {
    const client = getSupabase();
    if (!client) return;
    const address = email.trim();
    if (!isValidEmail(address)) {
      setError(tr('join.email.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: problem } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } }).catch(offline);
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
      setError(tr('join.code.wrong'));
      return;
    }
    setBusy(true);
    setError(null);
    // App store review account (API contract v0.8): its fixed code has 10 digits.
    if (token.length === 10 && api) {
      const review = await api.action<{ tokenHash: string }>('auth/review-sign-in', { email: email.trim(), code: token }).send();
      if (!review.ok) {
        setBusy(false);
        setError(review.code === 'network_error' ? authMessage('network') : tr('join.code.wrong'));
        return;
      }
      const { error: problem } = await client.auth.verifyOtp({ token_hash: review.data.tokenHash, type: 'email' }).catch(offline);
      setBusy(false);
      if (problem) setError(authMessage(authProblem(problem as AuthError)));
      return;
    }
    const { error: problem } = await client.auth.verifyOtp({ email: email.trim(), token, type: 'email' }).catch(offline);
    setBusy(false);
    if (problem) setError(authMessage(authProblem(problem as AuthError)));
  };

  const submitJoin = async () => {
    const found = profileProblems({ firstName, ageConfirmed }, new Date(), config);
    setProblems(found);
    if (found.length > 0 || !joinSlot || auth.status !== 'signed_in') return;
    setBusy(true);
    setError(null);
    const result = await joinSlot.send(
      'join',
      joinBody({
        firstName,
        email: auth.session.user.email ?? (email.trim() || null),
        locale,
        storeCode: store ? storeCode : null,
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

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const greeting = store ? tr('join.hero.storeHello', { store: inLocale(store.name, store.name_en, locale) }) : null;
  const switchLink =
    mode === 'join' ? (
      <Button label={tr('join.hero.signIn')} kind="text" onPress={() => setMode('signin')} />
    ) : (
      <Button label={tr('v2.signin.join')} kind="text" onPress={() => setMode('join')} />
    );

  if (!configured) {
    return (
      <FlowScreen title={tr('join.hero.cta')} onBack={leave}>
        <NotConfigured />
      </FlowScreen>
    );
  }

  if (step === 'email') {
    const field = (
      <TextField
        label={tr('join.email.label')}
        placeholder={tr('join.email.placeholder')}
        helper={mode === 'join' && !store ? tr('v2.join.emailHelper') : null}
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
    );
    const footer = (
      <>
        <Button label={tr('join.send')} onPress={sendCode} loading={busy} />
        {switchLink}
      </>
    );
    if (mode === 'signin') {
      return (
        <FlowScreen title={tr('auth.signIn.title')} onBack={leave} footer={footer}>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[t.displayL, styles.flex]}>
              {tr('v2.signin.title')}
            </Text>
            <Illo name="takeaway-cup" size={80} />
          </View>
          <Text style={t.bodyL}>{tr('auth.signIn.body')}</Text>
          {field}
        </FlowScreen>
      );
    }
    if (store) {
      return (
        <FlowScreen title={tr('join.hero.cta')} step={{ current: 1, total: 3 }} footer={footer} gap={space[12]}>
          <View style={styles.hello}>
            <Icon name="pin" size={18} />
            <Text style={t.bodySStrong}>{greeting}</Text>
          </View>
          <Text accessibilityRole="header" style={t.displayM}>
            {tr('join.hero.title')}
          </Text>
          <Text style={t.bodyM}>{tr('v2.join.storeBody')}</Text>
          <GiftBanner title={tr('v2.gift.locked.title')} body={tr('v2.gift.locked.body', { days: config.welcome.validDays })} />
          {field}
        </FlowScreen>
      );
    }
    return (
      <FlowScreen title={tr('join.hero.cta')} onBack={leave} step={{ current: 1, total: 3 }} footer={footer}>
        <Text accessibilityRole="header" style={t.displayL}>
          {tr('v2.join.title')}
        </Text>
        <Text style={t.bodyL}>{tr('join.method.body')}</Text>
        {field}
      </FlowScreen>
    );
  }

  if (step === 'code') {
    const waitSeconds = Math.max(0, Math.ceil((resendAt - now.getTime()) / 1000));
    const verifying = auth.status === 'signed_in' && member.status === 'loading';
    const ready = isValidOtp(normalizeOtp(code));
    return (
      <FlowScreen
        title={tr('join.code.label')}
        onBack={() => {
          setError(null);
          setStep('email');
        }}
        step={mode === 'join' ? { current: 2, total: 3 } : undefined}
        footer={<Button label={tr('join.code.submit')} onPress={verify} loading={busy || verifying} disabled={!ready && !busy} />}
      >
        <Text accessibilityRole="header" style={t.displayM}>
          {tr('join.code.titleEmail', { email: email.trim() })}
        </Text>
        <Text style={t.bodyL}>{tr('v2.code.body')}</Text>
        {verifying ? (
          <Loading />
        ) : (
          <>
            <OtpField
              label={tr('join.code.label')}
              value={code}
              onChange={(text) => {
                setCode(normalizeOtp(text));
                setError(null);
              }}
              onSubmit={verify}
              error={!!error}
              editable={!busy}
            />
            {error ? <ErrorText message={error} /> : null}
            <View>
              {waitSeconds > 0 ? (
                <Text style={[t.bodySStrong, { color: c.muted }]}>{tr('join.code.resendIn', { seconds: waitSeconds })}</Text>
              ) : (
                <Button label={tr('join.code.resend')} kind="text" size="S" onPress={sendCode} style={styles.left} />
              )}
              <Text style={t.bodyS}>{tr('join.code.spam')}</Text>
            </View>
            <Button
              label={tr('join.code.change')}
              kind="text"
              size="S"
              style={styles.left}
              onPress={() => {
                setError(null);
                setStep('email');
              }}
            />
          </>
        )}
      </FlowScreen>
    );
  }

  if (step === 'details') {
    return (
      <FlowScreen
        title={tr('join.profile.title')}
        step={{ current: 3, total: 3 }}
        gap={space[12]}
        footer={<Button label={tr('join.consents.submit')} onPress={submitJoin} loading={busy} />}
      >
        <Text accessibilityRole="header" style={t.displayM}>
          {tr('join.profile.title')}
        </Text>
        <TextField
          label={tr('join.profile.firstName')}
          helper={tr('join.profile.firstNameHint')}
          value={firstName}
          onChangeText={(text) => {
            setFirstName(text);
            setProblems((p) => p.filter((x) => x !== 'firstName'));
          }}
          error={problems.includes('firstName') ? tr('join.profile.firstNameMissing') : null}
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          maxLength={50}
        />
        <View>
          <Checkbox
            label={tr('v2.details.age', { age: config.minimumAge })}
            checked={ageConfirmed}
            error={problems.includes('age')}
            onChange={(next) => {
              setAgeConfirmed(next);
              if (next) setProblems((p) => p.filter((x) => x !== 'age'));
            }}
          />
          {problems.includes('age') ? <ErrorText message={tr('join.profile.ageMissing', { age: config.minimumAge })} /> : null}
        </View>
        <View style={styles.rule} />
        <View>
          <Text accessibilityRole="header" style={t.displayS}>
            {tr('join.consents.title')}
          </Text>
          <Text style={t.bodyS}>{tr('join.consents.body')}</Text>
        </View>
        <Checkbox label={tr('join.consents.email')} checked={consents.email} onChange={(v) => setConsents((x) => ({ ...x, email: v }))}>
          <Text style={[t.bodyS, { color: c.ink }]}>{tr('join.consents.email')}</Text>
        </Checkbox>
        <Checkbox label={tr('join.consents.sms')} checked={consents.sms} onChange={(v) => setConsents((x) => ({ ...x, sms: v }))}>
          <Text style={[t.bodyS, { color: c.ink }]}>{tr('join.consents.sms')}</Text>
        </Checkbox>
        {Platform.OS !== 'web' ? (
          <Checkbox label={tr('join.consents.push')} checked={consents.push} onChange={(v) => setConsents((x) => ({ ...x, push: v }))}>
            <Text style={[t.bodyS, { color: c.ink }]}>{tr('join.consents.push')}</Text>
          </Checkbox>
        ) : null}
        <Text style={t.bodyS}>
          {tr('join.consents.terms')}{' '}
          <Link href="/terms" style={styles.link}>
            {tr('legal.terms.title')}
          </Link>
          {' · '}
          <Link href="/privacy" style={styles.link}>
            {tr('legal.privacy.title')}
          </Link>
        </Text>
        {error ? <ErrorText message={error} /> : null}
      </FlowScreen>
    );
  }

  // welcome
  const wallets = walletButtons(Platform.OS);
  return (
    <FlowScreen
      title={tr('join.welcome.title', { programName: brand.programName })}
      footer={<Button label={tr('join.welcome.cta')} onPress={() => router.replace('/')} loading={busy} />}
      gap={space[16]}
    >
      <View style={styles.welcomeBand}>
      <View style={styles.welcomeHero}>
        <Illo name="eucalyptus" size={90} style={{ position: 'absolute', left: -12, top: -8 }} />
        <Illo name="sparkle" size={60} style={{ position: 'absolute', right: -4, top: 0 }} />
        <View style={styles.miniCard}>
          <View style={styles.miniTop}>
            <View style={styles.miniBrand}>
              <Lockup height={26} markOnly />
              <Text style={[t.title, { color: c.brand }]}>{brand.programName}</Text>
            </View>
            <TierSticker tier="classic" label={tierName(tr, 'classic')} />
          </View>
          <View style={styles.miniBottom}>
            <View style={styles.flex}>
              <Text style={t.displayS} numberOfLines={1}>
                {firstName.trim()}
              </Text>
              <Text style={t.bodySStrong}>{tr('rewards.cost', { points: '0' })}</Text>
            </View>
            <View style={styles.miniQr} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <QRCode value={brand.programName} size={78} color={qr.dark} backgroundColor={qr.light} ecl="L" quietZone={0} />
            </View>
          </View>
        </View>
        <Illo name="confetti" size={54} style={{ position: 'absolute', left: -6, bottom: -10 }} />
        <Illo name="croissant" size={72} style={{ position: 'absolute', right: -10, bottom: -16 }} />
      </View>
      </View>
      <Text accessibilityRole="header" style={t.displayL}>
        {tr('join.welcome.title')}
      </Text>
      <Text style={t.bodyM}>{tr('join.welcome.body')}</Text>
      <GiftBanner title={tr('v2.gift.locked.title')} body={tr('v2.gift.locked.inRewards', { days: config.welcome.validDays })} />
      {showsWalletCopy(Platform.OS) && wallets.length > 0 ? <Text style={t.bodyS}>{tr('join.welcome.wallet')}</Text> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  left: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  hello: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingLeft: space[12],
    paddingRight: space[16],
    paddingVertical: space[8],
    borderRadius: radius.pill,
    backgroundColor: c.mint,
    ...raised(1),
  },
  rule: { height: 2, backgroundColor: c.borderSubtle, marginVertical: space[4] },
  link: { ...t.bodySStrong, color: c.brand, textDecorationLine: 'underline' },
  // Green band behind the card preview, edge to edge (Figma 10 Success).
  welcomeBand: {
    marginHorizontal: -space[24],
    marginTop: -space[16],
    paddingHorizontal: space[24],
    paddingTop: space[16],
    paddingBottom: space[24],
    backgroundColor: c.brand,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  welcomeHero: { height: 250, justifyContent: 'center', alignItems: 'center' },
  miniCard: {
    width: 278,
    padding: 18,
    gap: 8,
    borderRadius: radius.xl,
    backgroundColor: c.sun,
    transform: [{ rotate: '-4deg' }],
    ...raised(4),
  },
  miniTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniBrand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: space[12] },
  miniQr: { padding: 6, backgroundColor: c.surface, borderRadius: radius.sm, borderWidth: 2, borderColor: c.ink },
});
