'use client';

import { normalizeRedemptionCode } from '@grow-loyalty/core';
import { type FormEvent, useEffect, useRef } from 'react';

import {
  canSubmitAward,
  type ConsoleState,
  type Employee,
  previewPoints,
  type Screen,
  undoAvailable,
} from '../../lib/console/machine';
import { formatEuroFromCents, formatPoints } from '../../lib/format';
import { digitKeys, type KeypadKey, pinDigitKeys, type PinKey } from '../../lib/keypad';
import styles from './console.module.css';
import { QrCamera } from './QrCamera';
import {
  Alert,
  AlertIcon,
  BackspaceIcon,
  Button,
  CheckIcon,
  CroissantIcon,
  GiftIcon,
  Initial,
  type KeyDef,
  Keypad,
  type ScreenContext,
  StarIcon,
  tierLabel,
} from './ui';

type Of<N extends Screen['name']> = Extract<Screen, { name: N }>;

/** Late points: receipt numbers are 1–40 characters (docs/api-contract.md §Late points). */
const RECEIPT_MAX_LENGTH = 40;

/** Physical keyboard on the keypad screens (handy on a tablet with a keyboard and on desktop). */
function useKeys(onKey: (key: string) => void, enabled: boolean) {
  const ref = useRef(onKey);
  useEffect(() => {
    ref.current = onKey;
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key) || event.key === 'Backspace' || event.key === 'Enter') {
        event.preventDefault();
        ref.current(event.key);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}

// ---------------------------------------------------------------------------
// Who's on the till? + PIN
// ---------------------------------------------------------------------------

export function PickCashierScreen({
  ctx,
  screen,
  employees,
  onSignOut,
}: {
  ctx: ScreenContext;
  screen: Of<'pick-cashier'>;
  employees: readonly Employee[];
  onSignOut: () => void;
}) {
  const { t, dispatch, newId } = ctx;
  const busy = screen.requestId !== null;
  const selected = employees.find((e) => e.id === screen.employeeId) ?? null;

  const keys: KeyDef<PinKey>[] = [
    ...pinDigitKeys.slice(0, 9).map((d) => ({ key: d, text: d })),
    { key: 'clear', text: 'C', label: t('console.pinClear') },
    { key: '0', text: '0' },
    { key: 'back', text: <BackspaceIcon />, label: t('console.keyBack') },
  ];
  const submit = () => dispatch({ type: 'pin/submit', requestId: newId() });

  useKeys((key) => {
    if (key === 'Enter') submit();
    else dispatch({ type: 'pin/key', key: key === 'Backspace' ? 'back' : (key as PinKey) });
  }, selected !== null && !busy);

  return (
    <div className={styles.split}>
      <section className={styles.column} aria-labelledby="cashier-title">
        <div className={styles.card}>
          <h1 id="cashier-title" className={styles.title}>
            {t('console.employee.title')}
          </h1>
          {screen.reason === 'idle' ? (
            <p className={styles.note}>
              {t('console.employee.locked', { minutes: ctx.config.limits.staffPinIdleMinutes })}
            </p>
          ) : null}
          {employees.length === 0 ? (
            <p className={styles.body}>{t('console.employee.empty')}</p>
          ) : (
            <div className={styles.names}>
              {employees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  className={styles.name}
                  aria-pressed={employee.id === screen.employeeId}
                  disabled={busy}
                  onClick={() => dispatch({ type: 'cashier/select', employeeId: employee.id })}
                >
                  <Initial name={employee.displayName} large />
                  <span>{employee.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={`${styles.link} ${styles.bottom}`} onClick={onSignOut} disabled={busy}>
          {t('console.device.signOut')}
        </button>
      </section>

      <section className={styles.pinPanel} aria-labelledby="pin-label">
        <div className={styles.pinHead}>
          <div className={styles.amountText}>
            <span id="pin-label" className={styles.amountLabel}>
              {t('console.employee.pin')}
            </span>
            <span className={styles.strong}>{selected ? selected.displayName : t('console.employee.pickFirst')}</span>
          </div>
          <div
            className={styles.dots}
            role="img"
            aria-label={t('console.employee.pinLength', { count: screen.pin.length })}
          >
            {Array.from({ length: Math.max(4, screen.pin.length) }, (_, i) => (
              <span key={i} className={`${styles.dot} ${i < screen.pin.length ? styles.dotOn : ''}`} />
            ))}
          </div>
        </div>
        <Keypad
          keys={keys}
          label={t('console.employee.pin')}
          disabled={!selected || busy}
          onPress={(key) => dispatch({ type: 'pin/key', key })}
        />
        {screen.error ? <Alert>{ctx.message(screen.error)}</Alert> : null}
        <Button variant="filled" size="huge" disabled={!selected || !screen.pin || busy} onClick={submit}>
          {busy ? t('console.scan.checking') : t('console.employee.start')}
        </Button>
        <p className={styles.muted}>{t('console.employee.pinHint')}</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan (idle)
// ---------------------------------------------------------------------------

function TypedCameraFallback({ ctx, onCamera }: { ctx: ScreenContext; onCamera: () => void }) {
  return (
    <div className={styles.card}>
      <p className={styles.body}>{ctx.t('console.scan.noCamera')}</p>
      <Button size="tall" onClick={onCamera}>
        {ctx.t('console.scan.useCamera')}
      </Button>
    </div>
  );
}

export function ScanScreen({ ctx, screen }: { ctx: ScreenContext; screen: Of<'idle'> }) {
  const { t, dispatch, newId } = ctx;
  const busy = screen.requestId !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    dispatch({ type: 'scan/submit', requestId: newId(), text: screen.input, typed: true });
  };

  return (
    <div className={styles.split}>
      <section className={styles.column} aria-label={t('console.scan.camera')}>
        {screen.mode === 'camera' ? (
          <QrCamera
            t={t}
            paused={busy}
            onRead={(text) => dispatch({ type: 'scan/submit', requestId: newId(), text })}
            onUnavailable={() => dispatch({ type: 'scan/mode', mode: 'type' })}
          />
        ) : (
          <TypedCameraFallback ctx={ctx} onCamera={() => dispatch({ type: 'scan/mode', mode: 'camera' })} />
        )}
      </section>

      <section className={styles.column} aria-labelledby="scan-title">
        <form className={styles.card} onSubmit={submit}>
          <h1 id="scan-title" className={styles.title}>
            {t('console.scan')}
          </h1>
          <p className={styles.body}>{t('console.scanHint')}</p>
          <p className={styles.strong}>{t('console.scan.type')}</p>
          <div className={styles.field}>
            <label htmlFor="scan-code" className={styles.label}>
              {t('console.scan.codeLabel')}
            </label>
            <p id="scan-code-hint" className={styles.muted}>
              {t('console.scan.typeHint')}
            </p>
            <div className={styles.row}>
              <input
                id="scan-code"
                aria-describedby="scan-code-hint"
                className={styles.input}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={screen.input}
                disabled={busy}
                onChange={(e) => dispatch({ type: 'scan/input', value: e.target.value })}
              />
              <Button type="submit" variant="filled" disabled={busy || !screen.input.trim()}>
                {busy ? t('console.scan.checking') : t('console.scan.submit')}
              </Button>
            </div>
          </div>
          {busy ? (
            <p className={styles.muted} role="status">
              {t('console.scan.checking')}
            </p>
          ) : null}
          {screen.error ? <Alert>{ctx.message(screen.error)}</Alert> : null}
        </form>
        <Button size="tall" className={styles.bottom} disabled={busy} onClick={() => dispatch({ type: 'redeem/open' })}>
          {t('console.redeem.title')}
        </Button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member + amount (also shown while awarding)
// ---------------------------------------------------------------------------

export function AmountScreen({ ctx, screen }: { ctx: ScreenContext; screen: Of<'member' | 'amount' | 'awarding'> }) {
  const { t, locale, config, dispatch, newId } = ctx;
  const busy = screen.name === 'awarding';
  const { member } = screen;
  const points = previewPoints(screen.amountCents, member.tier, config);
  const canSubmit = canSubmitAward(screen, config);

  const keys: KeyDef<KeypadKey>[] = [
    ...digitKeys.map((d) => ({ key: d, text: d })),
    { key: 'back', text: <BackspaceIcon />, label: t('console.keyBack') },
  ];
  const submit = () =>
    dispatch({ type: 'award/submit', requestId: newId(), idempotencyKey: newId(), now: Date.now() });

  useKeys((key) => {
    if (key === 'Enter') submit();
    else dispatch({ type: 'amount/key', key: key === 'Backspace' ? 'back' : (key as KeypadKey) });
  }, !busy);

  return (
    <div className={styles.split}>
      <section className={styles.column} aria-labelledby="member-name">
        <div className={styles.card}>
          <p className={styles.eyebrow}>{t('console.member.title')}</p>
          <h1 id="member-name" className={styles.memberName}>
            {member.firstName}
          </h1>
          <div className={styles.tags}>
            <span className={`${styles.tag} ${styles.tagOutline}`}>{tierLabel(t, member.tier)}</span>
          </div>
          <p className={styles.balance}>{t('console.member.balance', { points: formatPoints(member.balance, locale) })}</p>
          <p className={styles.note}>{t('console.member.check')}</p>
        </div>

        {screen.notice === 'undone' ? (
          <p className={styles.callout} role="status">
            {t('console.undo.done')}
          </p>
        ) : null}

        <div className={styles.column}>
          <button
            type="button"
            className={styles.link}
            aria-expanded={screen.lateOpen}
            aria-controls="late-points"
            disabled={busy}
            onClick={() => dispatch({ type: 'late/toggle' })}
          >
            {t('console.late.toggle')}
          </button>
          {screen.lateOpen ? (
            <div id="late-points" className={styles.field}>
              <label htmlFor="receipt-number" className={styles.label}>
                {t('console.late.receipt')}
              </label>
              <input
                id="receipt-number"
                className={styles.input}
                autoComplete="off"
                spellCheck={false}
                maxLength={RECEIPT_MAX_LENGTH}
                value={screen.receiptNumber}
                disabled={busy}
                onChange={(e) => dispatch({ type: 'late/receipt', value: e.target.value })}
              />
              <p className={styles.muted}>{t('console.late.hint')}</p>
            </div>
          ) : null}
        </div>

        <div className={`${styles.pair} ${styles.bottom}`}>
          <Button size="tall" disabled={busy} onClick={() => dispatch({ type: 'next' })}>
            {t('console.member.newScan')}
          </Button>
          <Button size="tall" disabled={busy} onClick={() => dispatch({ type: 'redeem/open' })}>
            {t('console.redeem.title')}
          </Button>
        </div>
      </section>

      <section className={styles.column} aria-labelledby="amount-label">
        <div className={styles.amountPanel}>
          <div className={styles.amountText}>
            <span id="amount-label" className={styles.amountLabel}>
              {t('console.amount')}
            </span>
            <output className={styles.amountValue} aria-live="polite" aria-labelledby="amount-label">
              {formatEuroFromCents(screen.amountCents, locale)}
            </output>
          </div>
          <div className={styles.amountSide}>
            {points !== null && points > 0 ? (
              <span className={`${styles.tag} ${styles.tagPaper}`} aria-live="polite">
                {t('console.award.preview', { points: formatPoints(points, locale) })}
              </span>
            ) : null}
            {points === 0 ? <span className={styles.limit}>{ctx.message('amount_too_small')}</span> : null}
            <span className={styles.limit}>
              {t('console.maxAmount', { max: formatEuroFromCents(config.limits.maxAmountCents, locale) })}
            </span>
          </div>
        </div>
        <Keypad keys={keys} label={t('console.keypad')} disabled={busy} onPress={(key) => dispatch({ type: 'amount/key', key })} />
        <Button variant="filled" size="huge" disabled={!canSubmit} onClick={submit} aria-busy={busy}>
          {busy ? t('console.award.sending') : t('console.award')}
        </Button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Points added (+ undo)
// ---------------------------------------------------------------------------

export function DoneScreen({ ctx, state, now }: { ctx: ScreenContext; state: ConsoleState; now: number }) {
  const { t, locale, config, dispatch, newId } = ctx;
  const screen = state.screen as Of<'done'>;
  const { member, award, undo } = screen;
  const canUndoNow = undoAvailable(state, now);
  const confirming = undo.phase !== 'idle';
  const firstName = member.firstName;

  return (
    <div className={styles.center}>
      <section className={`${styles.card} ${styles.resultCard}`} aria-labelledby="done-title">
        <div className={styles.resultIcon}>
          <CheckIcon />
        </div>
        <h1 id="done-title" className={styles.resultTitle} role="status">
          {t('console.award.success', { firstName, points: formatPoints(award.points, locale) })}
        </h1>
        <p className={styles.strong}>{t('console.award.balance', { points: formatPoints(award.balance, locale) })}</p>
        {award.welcomeGiftUnlocked ? (
          <div className={styles.callout}>
            <CroissantIcon />
            <p>{t('console.award.firstPurchase')}</p>
          </div>
        ) : null}
        {award.tierChanged ? (
          <div className={styles.callout}>
            <StarIcon />
            <p>{t('console.award.tierUp', { firstName, tier: tierLabel(t, award.tier) })}</p>
          </div>
        ) : null}
        {undo.error ? <Alert>{ctx.message(undo.error)}</Alert> : null}

        {confirming ? (
          <>
            <p className={styles.strong}>
              {t('console.undo.confirm', { points: formatPoints(award.points, locale), firstName })}
            </p>
            <div className={styles.pair}>
              <Button size="tall" disabled={undo.phase === 'busy'} onClick={() => dispatch({ type: 'undo/cancel' })}>
                {t('console.cancel')}
              </Button>
              <Button
                variant="filled"
                size="tall"
                disabled={undo.phase === 'busy' || !canUndoNow}
                onClick={() =>
                  dispatch({ type: 'undo/submit', requestId: newId(), idempotencyKey: newId(), now: Date.now() })
                }
              >
                {undo.phase === 'busy' ? t('console.undo.sending') : t('console.undo.yes')}
              </Button>
            </div>
          </>
        ) : (
          <div className={styles.pair} style={canUndoNow ? undefined : { gridTemplateColumns: '1fr' }}>
            {canUndoNow ? (
              <Button size="tall" onClick={() => dispatch({ type: 'undo/ask', now: Date.now() })}>
                {t('console.undo')}
              </Button>
            ) : null}
            <Button variant="filled" size="tall" onClick={() => dispatch({ type: 'next' })}>
              {t('console.next')}
            </Button>
          </div>
        )}
        {canUndoNow ? (
          <p className={styles.muted}>{t('console.undo.hint', { minutes: config.limits.undoWindowMinutes })}</p>
        ) : null}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Award failed
// ---------------------------------------------------------------------------

export function AwardErrorScreen({ ctx, screen }: { ctx: ScreenContext; screen: Of<'error'> }) {
  const { t, locale, dispatch, newId } = ctx;
  return (
    <div className={styles.center}>
      <section className={`${styles.card} ${styles.resultCard}`} aria-labelledby="error-title">
        <div className={`${styles.resultIcon} ${styles.resultIconAlert}`}>
          <AlertIcon />
        </div>
        <h1 id="error-title" className={styles.title}>
          {t('console.error.title')}
        </h1>
        <p className={styles.strong}>
          {screen.member.firstName} · {formatEuroFromCents(screen.amountCents, locale)}
        </p>
        <Alert>{ctx.message(screen.error)}</Alert>
        {screen.retryable ? (
          <div className={styles.pair}>
            <Button size="tall" onClick={() => dispatch({ type: 'error/back' })}>
              {t('console.back')}
            </Button>
            <Button variant="filled" size="tall" onClick={() => dispatch({ type: 'award/retry', requestId: newId() })}>
              {t('console.retry')}
            </Button>
          </div>
        ) : (
          <div className={styles.pair}>
            <Button size="tall" onClick={() => dispatch({ type: 'next' })}>
              {t('console.next')}
            </Button>
            <Button variant="filled" size="tall" onClick={() => dispatch({ type: 'error/back' })}>
              {t('console.back')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redeem a reward
// ---------------------------------------------------------------------------

export function RedeemScreen({ ctx, screen }: { ctx: ScreenContext; screen: Of<'redeem'> }) {
  const { t, dispatch, newId } = ctx;
  const busy = screen.requestId !== null;
  const valid = normalizeRedemptionCode(screen.input) !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    dispatch({ type: 'redeem/submit', requestId: newId(), idempotencyKey: newId(), now: Date.now() });
  };

  return (
    <div className={styles.split}>
      <section className={styles.column} aria-label={t('console.scan.camera')}>
        {screen.mode === 'camera' ? (
          <QrCamera
            t={t}
            paused={busy}
            onRead={(text) => dispatch({ type: 'redeem/detected', requestId: newId(), text })}
            onUnavailable={() => dispatch({ type: 'redeem/mode', mode: 'type' })}
          />
        ) : (
          <TypedCameraFallback ctx={ctx} onCamera={() => dispatch({ type: 'redeem/mode', mode: 'camera' })} />
        )}
      </section>

      <section className={styles.column} aria-labelledby="redeem-title">
        <form className={styles.card} onSubmit={submit}>
          <h1 id="redeem-title" className={styles.title}>
            {t('console.redeem.title')}
          </h1>
          <div className={styles.field}>
            <label htmlFor="redeem-code" className={styles.label}>
              {t('console.redeem.codeLabel')}
            </label>
            <input
              id="redeem-code"
              className={`${styles.input} ${styles.codeInput}`}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={16}
              value={screen.input}
              disabled={busy}
              onChange={(e) => dispatch({ type: 'redeem/input', value: e.target.value })}
            />
            <p className={styles.muted}>{t('console.redeem.typeHint')}</p>
          </div>
          {screen.error ? <Alert>{ctx.message(screen.error)}</Alert> : null}
          <Button type="submit" variant="filled" size="huge" disabled={!valid || busy} aria-busy={busy}>
            {busy ? t('console.redeem.sending') : t('console.redeem.confirm')}
          </Button>
        </form>
        <Button size="tall" className={styles.bottom} disabled={busy} onClick={() => dispatch({ type: 'next' })}>
          {t('console.back')}
        </Button>
      </section>
    </div>
  );
}

export function RedeemedScreen({ ctx, screen }: { ctx: ScreenContext; screen: Of<'redeemed'> }) {
  const { t, locale, dispatch } = ctx;
  const { result } = screen;
  const reward = locale === 'el' ? result.rewardNameEl : result.rewardNameEn;
  return (
    <div className={styles.center}>
      <section className={`${styles.card} ${styles.resultCard}`} aria-labelledby="redeemed-title">
        <div className={styles.resultIcon}>
          <CheckIcon />
        </div>
        <p className={styles.eyebrow}>{t('console.redeem.member', { firstName: result.memberFirstName })}</p>
        <h1 id="redeemed-title" className={styles.title} role="status">
          {t('console.redeem.reward', { reward })}
        </h1>
        <div className={styles.callout}>
          <GiftIcon />
          <p>{t('console.redeem.done')}</p>
        </div>
        <p className={styles.muted}>{t('console.redeem.why')}</p>
        <Button variant="filled" size="huge" onClick={() => dispatch({ type: 'next' })}>
          {t('console.next')}
        </Button>
      </section>
    </div>
  );
}
