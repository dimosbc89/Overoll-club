/**
 * Staff console (till) as a pure state machine.
 *
 *   starting ─► signed-out (email → code) ─► starting ─► pick-cashier ─► idle (scan)
 *   idle ─► member ─► amount ─► awarding ─► done (undo while core canUndo) ─► idle
 *                                  └──────► error (retry with the SAME key / back)
 *   idle | member ─► redeem ─► redeemed ─► idle
 *   any till screen ─► pick-cashier on "Switch cashier" or after the idle lock
 *
 * The reducer never does I/O. Screens that need the server carry a `requestId`;
 * `pendingRequest(state)` says which call to make, the console runs it
 * (`runner.ts`) and dispatches the result with the same `requestId`. Results
 * for a request that is no longer current (the cashier moved on) are ignored.
 *
 * Fresh ids and idempotency keys come in with the actions, so the reducer
 * stays deterministic. A retry after `network_error` / `internal_error` reuses
 * the key of the first attempt as long as the payload is unchanged.
 */
import {
  type ProgramConfig,
  type TierId,
  canUndo,
  defaultConfig,
  normalizeRedemptionCode,
  parseToken,
  pointsForPurchase,
  validatePurchaseAmount,
} from '@overoll/core';

import {
  type AwardedPoints,
  type AwardInput,
  isRetryable,
  type ScannedMember,
  type UndoInput,
  type UndoneEarn,
  type UsedRedemption,
  type UseRedemptionInput,
} from '../api';
import { type KeypadKey, type PinKey, pressKey, pressPinKey } from '../keypad';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface StoreInfo {
  id: string;
  name: string;
  timeZone: string;
}

export interface Employee {
  id: string;
  displayName: string;
}

/** The cashier on the till. The PIN lives here, in memory only, until the lock. */
export interface Cashier {
  employeeId: string;
  displayName: string;
  pin: string;
}

export interface Member {
  memberId: string;
  firstName: string;
  tier: TierId;
  balance: number;
}

export interface DeviceContext {
  store: StoreInfo;
  employees: Employee[];
  /** The brand's program config (core `resolveConfig` of `brands.config`). */
  config: ProgramConfig;
}

/** Idempotency key of an action, kept for retries of the same payload. */
export interface RetryKey {
  key: string;
  /** What the key was used for; a different payload gets a fresh key. */
  signature: string;
  /** When the first attempt with this key was sent (ms). */
  sentAt: number;
}

export type ScanMode = 'camera' | 'type';

interface AmountFields {
  member: Member;
  amountCents: number;
  /** "Forgot the card earlier?" opened: late points with a receipt number. */
  lateOpen: boolean;
  receiptNumber: string;
  retry: RetryKey | null;
  /** Shown above the keypad after an undo. */
  notice: 'undone' | null;
}

export interface UndoState {
  phase: 'idle' | 'confirm' | 'busy';
  requestId: string | null;
  error: string | null;
  retry: RetryKey | null;
}

export type Screen =
  | { name: 'starting'; requestId: string }
  | { name: 'not-configured' }
  | {
      name: 'signed-out';
      step: 'email' | 'code';
      email: string;
      code: string;
      requestId: string | null;
      error: string | null;
    }
  | { name: 'no-store' }
  | { name: 'device-error'; error: string }
  | {
      name: 'pick-cashier';
      reason: 'start' | 'switch' | 'idle';
      employeeId: string | null;
      pin: string;
      requestId: string | null;
      error: string | null;
    }
  | { name: 'idle'; mode: ScanMode; input: string; requestId: string | null; token: string | null; error: string | null }
  | ({ name: 'member' | 'amount' } & AmountFields)
  | ({ name: 'awarding'; requestId: string; retry: RetryKey } & Omit<AmountFields, 'retry'>)
  | ({ name: 'error'; error: string; retryable: boolean; retry: RetryKey } & Omit<AmountFields, 'retry'>)
  | { name: 'done'; member: Member; award: AwardedPoints; amountCents: number; awardedAt: number; undo: UndoState }
  | { name: 'redeem'; mode: ScanMode; input: string; requestId: string | null; error: string | null; retry: RetryKey | null }
  | { name: 'redeemed'; result: UsedRedemption };

export type ScreenName = Screen['name'];

export interface ConsoleState {
  config: ProgramConfig;
  store: StoreInfo | null;
  employees: Employee[];
  cashier: Cashier | null;
  todayOpen: boolean;
  screen: Screen;
}

export function initialState(options: { configured: boolean; requestId: string }): ConsoleState {
  return {
    config: defaultConfig,
    store: null,
    employees: [],
    cashier: null,
    todayOpen: false,
    screen: options.configured ? { name: 'starting', requestId: options.requestId } : { name: 'not-configured' },
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ConsoleAction =
  // Device sign-in
  | { type: 'device/loaded'; requestId: string; context: DeviceContext }
  | { type: 'device/noStore'; requestId: string }
  | { type: 'device/loadFailed'; requestId: string; error: string }
  | { type: 'device/retry'; requestId: string }
  /** From a load result (with requestId) or an auth event / sign-out (without). */
  | { type: 'device/signedOut'; requestId?: string }
  | { type: 'otp/email'; value: string }
  | { type: 'otp/code'; value: string }
  | { type: 'otp/send'; requestId: string }
  | { type: 'otp/sent'; requestId: string }
  | { type: 'otp/verify'; requestId: string }
  | { type: 'otp/verified'; requestId: string; loadRequestId: string }
  | { type: 'otp/failed'; requestId: string; error: string }
  | { type: 'otp/back' }
  | { type: 'employees/loaded'; employees: Employee[] }
  // Cashier
  | { type: 'cashier/select'; employeeId: string }
  | { type: 'cashier/unselect' }
  | { type: 'pin/key'; key: PinKey }
  | { type: 'pin/submit'; requestId: string }
  | { type: 'pin/verified'; requestId: string; employee: Employee }
  | { type: 'pin/failed'; requestId: string; error: string }
  | { type: 'cashier/switch' }
  | { type: 'idle/lock' }
  // Scan
  | { type: 'scan/mode'; mode: ScanMode }
  | { type: 'scan/input'; value: string }
  /** Typed or read by the camera. */
  | { type: 'scan/submit'; requestId: string; text: string }
  | { type: 'scan/succeeded'; requestId: string; member: ScannedMember }
  | { type: 'scan/failed'; requestId: string; error: string }
  // Amount and award
  | { type: 'amount/key'; key: KeypadKey }
  | { type: 'late/toggle' }
  | { type: 'late/receipt'; value: string }
  | { type: 'award/submit'; requestId: string; idempotencyKey: string; now: number }
  | { type: 'award/succeeded'; requestId: string; result: AwardedPoints }
  | { type: 'award/failed'; requestId: string; error: string }
  | { type: 'award/retry'; requestId: string }
  | { type: 'error/back' }
  // Undo
  | { type: 'undo/ask'; now: number }
  | { type: 'undo/cancel' }
  | { type: 'undo/submit'; requestId: string; idempotencyKey: string; now: number }
  | { type: 'undo/succeeded'; requestId: string; result: UndoneEarn }
  | { type: 'undo/failed'; requestId: string; error: string }
  // Redeem
  | { type: 'redeem/open'; code?: string }
  | { type: 'redeem/mode'; mode: ScanMode }
  | { type: 'redeem/input'; value: string }
  | { type: 'redeem/detected'; requestId: string; text: string }
  | { type: 'redeem/submit'; requestId: string; idempotencyKey: string; now: number }
  | { type: 'redeem/succeeded'; requestId: string; result: UsedRedemption }
  | { type: 'redeem/failed'; requestId: string; error: string }
  // Navigation
  | { type: 'next' }
  | { type: 'today/open' }
  | { type: 'today/close' };

// ---------------------------------------------------------------------------
// Derived values (used by the reducer and the screens)
// ---------------------------------------------------------------------------

/** Points the member would get: null while the amount is not a valid receipt total. */
export function previewPoints(amountCents: number, tier: TierId, config: ProgramConfig): number | null {
  if (validatePurchaseAmount(amountCents, config) !== null) return null;
  return pointsForPurchase(amountCents, tier, config);
}

/** Can "Add points" be pressed on this amount screen? */
export function canSubmitAward(screen: Screen, config: ProgramConfig): boolean {
  if (screen.name !== 'amount') return false;
  const points = previewPoints(screen.amountCents, screen.member.tier, config);
  if (points === null || points <= 0) return false;
  return !screen.lateOpen || screen.receiptNumber.trim() !== '';
}

/** Is the Undo button still shown on the done screen? */
export function undoAvailable(state: ConsoleState, now: number): boolean {
  const s = state.screen;
  return s.name === 'done' && canUndo(new Date(s.awardedAt), new Date(now), state.config);
}

export type PendingRequest =
  | { id: string; kind: 'loadDevice' }
  | { id: string; kind: 'sendCode'; email: string }
  | { id: string; kind: 'verifyCode'; email: string; code: string }
  | { id: string; kind: 'verifyPin'; storeId: string; employeeId: string; pin: string }
  | { id: string; kind: 'scan'; storeId: string; token: string }
  | { id: string; kind: 'award'; input: AwardInput }
  | { id: string; kind: 'undo'; input: UndoInput }
  | { id: string; kind: 'redeem'; input: UseRedemptionInput };

/** The server call the current state is waiting for, if any. */
export function pendingRequest(state: ConsoleState): PendingRequest | null {
  const s = state.screen;
  const { store, cashier } = state;
  switch (s.name) {
    case 'starting':
      return { id: s.requestId, kind: 'loadDevice' };
    case 'signed-out':
      if (!s.requestId) return null;
      return s.step === 'email'
        ? { id: s.requestId, kind: 'sendCode', email: s.email.trim() }
        : { id: s.requestId, kind: 'verifyCode', email: s.email.trim(), code: s.code.trim() };
    case 'pick-cashier':
      if (!s.requestId || !s.employeeId || !store) return null;
      return { id: s.requestId, kind: 'verifyPin', storeId: store.id, employeeId: s.employeeId, pin: s.pin };
    case 'idle':
      if (!s.requestId || !s.token || !store) return null;
      return { id: s.requestId, kind: 'scan', storeId: store.id, token: s.token };
    case 'awarding':
      if (!store || !cashier) return null;
      return {
        id: s.requestId,
        kind: 'award',
        input: {
          storeId: store.id,
          employeeId: cashier.employeeId,
          pin: cashier.pin,
          memberId: s.member.memberId,
          amountCents: s.amountCents,
          ...(s.lateOpen && s.receiptNumber ? { receiptNumber: s.receiptNumber } : {}),
          idempotencyKey: s.retry.key,
        },
      };
    case 'done':
      if (s.undo.phase !== 'busy' || !s.undo.requestId || !s.undo.retry || !cashier) return null;
      return {
        id: s.undo.requestId,
        kind: 'undo',
        input: {
          entryId: s.award.entryId,
          employeeId: cashier.employeeId,
          pin: cashier.pin,
          idempotencyKey: s.undo.retry.key,
        },
      };
    case 'redeem':
      if (!s.requestId || !s.retry || !store || !cashier) return null;
      return {
        id: s.requestId,
        kind: 'redeem',
        input: {
          storeId: store.id,
          employeeId: cashier.employeeId,
          pin: cashier.pin,
          code: s.retry.signature,
          idempotencyKey: s.retry.key,
        },
      };
    default:
      return null;
  }
}

export function isBusy(state: ConsoleState): boolean {
  return pendingRequest(state) !== null;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const scanScreen = (error: string | null = null): Screen => ({
  name: 'idle',
  mode: 'camera',
  input: '',
  requestId: null,
  token: null,
  error,
});

const signedOut = (): Screen => ({ name: 'signed-out', step: 'email', email: '', code: '', requestId: null, error: null });

const redeemScreen = (code?: string): Screen => ({
  name: 'redeem',
  mode: code ? 'type' : 'camera',
  input: code ?? '',
  requestId: null,
  error: null,
  retry: null,
});

function memberScreen(member: Member, notice: AmountFields['notice'] = null): Screen {
  return { name: 'member', member, amountCents: 0, lateOpen: false, receiptNumber: '', retry: null, notice };
}

/** Reuse the key for the same payload, otherwise take the fresh one. */
function keyFor(previous: RetryKey | null, signature: string, freshKey: string, now: number): RetryKey {
  return previous && previous.signature === signature ? previous : { key: freshKey, signature, sentAt: now };
}

/** Start scanning a member token, or open redeem for something that is a redemption code. */
function startScan(state: ConsoleState, requestId: string, raw: string): ConsoleState {
  const text = raw.trim();
  if (!text || !state.store || !state.cashier) return state;
  if (!parseToken(text)) {
    const code = normalizeRedemptionCode(text);
    if (code) return { ...state, screen: redeemScreen(code) };
  }
  return { ...state, screen: { name: 'idle', mode: 'type', input: text, requestId, token: text, error: null } };
}

function lockTo(state: ConsoleState, reason: 'switch' | 'idle'): ConsoleState {
  if (!state.cashier || isBusy(state)) return state;
  return {
    ...state,
    cashier: null,
    todayOpen: false,
    screen: {
      name: 'pick-cashier',
      reason,
      // After the idle lock the same cashier usually carries on: keep their name picked.
      employeeId: reason === 'idle' ? state.cashier.employeeId : null,
      pin: '',
      requestId: null,
      error: null,
    },
  };
}

export function consoleReducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  const s = state.screen;
  const config = state.config;

  switch (action.type) {
    // --- Device ----------------------------------------------------------
    case 'device/loaded':
      if (s.name !== 'starting' || s.requestId !== action.requestId) return state;
      return {
        ...state,
        config: action.context.config,
        store: action.context.store,
        employees: action.context.employees,
        cashier: null,
        screen: { name: 'pick-cashier', reason: 'start', employeeId: null, pin: '', requestId: null, error: null },
      };
    case 'device/noStore':
      if (s.name !== 'starting' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { name: 'no-store' } };
    case 'device/loadFailed':
      if (s.name !== 'starting' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { name: 'device-error', error: action.error } };
    case 'device/retry':
      if (s.name !== 'device-error') return state;
      return { ...state, screen: { name: 'starting', requestId: action.requestId } };
    case 'device/signedOut':
      if (action.requestId !== undefined && (s.name !== 'starting' || s.requestId !== action.requestId)) return state;
      if (s.name === 'not-configured' || s.name === 'signed-out') return state;
      return { ...state, store: null, employees: [], cashier: null, todayOpen: false, config: defaultConfig, screen: signedOut() };

    case 'otp/email':
      if (s.name !== 'signed-out' || s.requestId) return state;
      return { ...state, screen: { ...s, email: action.value, error: null } };
    case 'otp/code':
      if (s.name !== 'signed-out' || s.requestId) return state;
      return { ...state, screen: { ...s, code: action.value.replace(/\D/g, ''), error: null } };
    case 'otp/send':
      if (s.name !== 'signed-out' || s.requestId || s.step !== 'email' || !s.email.trim()) return state;
      return { ...state, screen: { ...s, requestId: action.requestId, error: null } };
    case 'otp/sent':
      if (s.name !== 'signed-out' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { ...s, step: 'code', code: '', requestId: null } };
    case 'otp/verify':
      if (s.name !== 'signed-out' || s.requestId || s.step !== 'code' || !s.code.trim()) return state;
      return { ...state, screen: { ...s, requestId: action.requestId, error: null } };
    case 'otp/verified':
      if (s.name !== 'signed-out' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { name: 'starting', requestId: action.loadRequestId } };
    case 'otp/failed':
      if (s.name !== 'signed-out' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { ...s, requestId: null, error: action.error, code: '' } };
    case 'otp/back':
      if (s.name !== 'signed-out' || s.requestId) return state;
      return { ...state, screen: { ...s, step: 'email', code: '', error: null } };

    case 'employees/loaded':
      if (!state.store) return state;
      return { ...state, employees: action.employees };

    // --- Cashier ---------------------------------------------------------
    case 'cashier/select':
      if (s.name !== 'pick-cashier' || s.requestId) return state;
      if (!state.employees.some((e) => e.id === action.employeeId)) return state;
      return { ...state, screen: { ...s, employeeId: action.employeeId, pin: '', error: null } };
    case 'cashier/unselect':
      if (s.name !== 'pick-cashier' || s.requestId) return state;
      return { ...state, screen: { ...s, employeeId: null, pin: '', error: null } };
    case 'pin/key':
      if (s.name !== 'pick-cashier' || s.requestId || !s.employeeId) return state;
      return { ...state, screen: { ...s, pin: pressPinKey(s.pin, action.key), error: null } };
    case 'pin/submit':
      if (s.name !== 'pick-cashier' || s.requestId || !s.employeeId || !s.pin || !state.store) return state;
      return { ...state, screen: { ...s, requestId: action.requestId, error: null } };
    case 'pin/verified':
      if (s.name !== 'pick-cashier' || s.requestId !== action.requestId || !s.employeeId) return state;
      return {
        ...state,
        cashier: { employeeId: action.employee.id, displayName: action.employee.displayName, pin: s.pin },
        screen: scanScreen(),
      };
    case 'pin/failed':
      if (s.name !== 'pick-cashier' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { ...s, requestId: null, pin: '', error: action.error } };
    case 'cashier/switch':
      return lockTo(state, 'switch');
    case 'idle/lock':
      return lockTo(state, 'idle');

    // --- Scan ------------------------------------------------------------
    case 'scan/mode':
      if (s.name !== 'idle' || s.requestId) return state;
      return { ...state, screen: { ...s, mode: action.mode, error: null } };
    case 'scan/input':
      if (s.name !== 'idle' || s.requestId) return state;
      return { ...state, screen: { ...s, input: action.value, error: null } };
    case 'scan/submit':
      if (s.name !== 'idle' || s.requestId) return state;
      return startScan(state, action.requestId, action.text);
    case 'scan/succeeded': {
      if (s.name !== 'idle' || s.requestId !== action.requestId) return state;
      const { memberId, firstName, tier, balance } = action.member;
      return { ...state, screen: memberScreen({ memberId, firstName, tier, balance }) };
    }
    case 'scan/failed':
      if (s.name !== 'idle' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { ...s, requestId: null, token: null, error: action.error } };

    // --- Amount ----------------------------------------------------------
    case 'amount/key': {
      if (s.name !== 'member' && s.name !== 'amount') return state;
      const amountCents = pressKey(s.amountCents, action.key, config.limits.maxAmountCents);
      return { ...state, screen: { ...s, name: amountCents > 0 ? 'amount' : 'member', amountCents, notice: null } };
    }
    case 'late/toggle':
      if (s.name !== 'member' && s.name !== 'amount') return state;
      return { ...state, screen: { ...s, lateOpen: !s.lateOpen } };
    case 'late/receipt':
      if (s.name !== 'member' && s.name !== 'amount') return state;
      return { ...state, screen: { ...s, receiptNumber: action.value } };
    case 'award/submit': {
      if (s.name !== 'amount' || !canSubmitAward(s, config) || !state.cashier) return state;
      const receiptNumber = s.lateOpen ? s.receiptNumber.trim() : '';
      const signature = JSON.stringify([s.member.memberId, s.amountCents, receiptNumber]);
      return {
        ...state,
        screen: {
          name: 'awarding',
          member: s.member,
          amountCents: s.amountCents,
          lateOpen: s.lateOpen,
          receiptNumber,
          notice: null,
          requestId: action.requestId,
          retry: keyFor(s.retry, signature, action.idempotencyKey, action.now),
        },
      };
    }
    case 'award/succeeded': {
      if (s.name !== 'awarding' || s.requestId !== action.requestId) return state;
      const { result } = action;
      return {
        ...state,
        screen: {
          name: 'done',
          member: { ...s.member, balance: result.balance, tier: result.tier },
          award: result,
          amountCents: s.amountCents,
          // The entry was written after the first attempt was sent: counting the
          // undo window from then can only close it early, never late.
          awardedAt: s.retry.sentAt,
          undo: { phase: 'idle', requestId: null, error: null, retry: null },
        },
      };
    }
    case 'award/failed': {
      if (s.name !== 'awarding' || s.requestId !== action.requestId) return state;
      const { requestId: _requestId, name: _name, ...fields } = s;
      return { ...state, screen: { ...fields, name: 'error', error: action.error, retryable: isRetryable(action.error) } };
    }
    case 'award/retry': {
      if (s.name !== 'error' || !s.retryable || !state.cashier) return state;
      const { error: _error, retryable: _retryable, name: _name, ...fields } = s;
      return { ...state, screen: { ...fields, name: 'awarding', requestId: action.requestId } };
    }
    case 'error/back': {
      if (s.name !== 'error') return state;
      const { error: _error, retryable, name: _name, retry, ...fields } = s;
      // Keep the key after a network/server error: the award may have gone through.
      return { ...state, screen: { ...fields, name: 'amount', retry: retryable ? retry : null } };
    }

    // --- Undo ------------------------------------------------------------
    case 'undo/ask':
      if (s.name !== 'done' || s.undo.phase !== 'idle') return state;
      if (!canUndo(new Date(s.awardedAt), new Date(action.now), config)) {
        return { ...state, screen: { ...s, undo: { ...s.undo, error: 'undo_window_passed' } } };
      }
      return { ...state, screen: { ...s, undo: { ...s.undo, phase: 'confirm', error: null } } };
    case 'undo/cancel':
      if (s.name !== 'done' || s.undo.phase !== 'confirm') return state;
      return { ...state, screen: { ...s, undo: { ...s.undo, phase: 'idle' } } };
    case 'undo/submit':
      if (s.name !== 'done' || s.undo.phase !== 'confirm' || !state.cashier) return state;
      if (!canUndo(new Date(s.awardedAt), new Date(action.now), config)) {
        return { ...state, screen: { ...s, undo: { ...s.undo, phase: 'idle', error: 'undo_window_passed' } } };
      }
      return {
        ...state,
        screen: {
          ...s,
          undo: {
            phase: 'busy',
            requestId: action.requestId,
            error: null,
            retry: keyFor(s.undo.retry, s.award.entryId, action.idempotencyKey, action.now),
          },
        },
      };
    case 'undo/succeeded':
      if (s.name !== 'done' || s.undo.requestId !== action.requestId || s.undo.phase !== 'busy') return state;
      return { ...state, screen: memberScreen({ ...s.member, balance: action.result.balance }, 'undone') };
    case 'undo/failed':
      if (s.name !== 'done' || s.undo.requestId !== action.requestId || s.undo.phase !== 'busy') return state;
      return {
        ...state,
        screen: {
          ...s,
          undo: {
            phase: 'idle',
            requestId: null,
            error: action.error,
            retry: isRetryable(action.error) ? s.undo.retry : null,
          },
        },
      };

    // --- Redeem ----------------------------------------------------------
    case 'redeem/open':
      if (!state.cashier || isBusy(state)) return state;
      if (!['idle', 'member', 'amount', 'done', 'redeemed', 'error'].includes(s.name)) return state;
      return { ...state, todayOpen: false, screen: redeemScreen(action.code ? normalizeRedemptionCode(action.code) ?? action.code : undefined) };
    case 'redeem/mode':
      if (s.name !== 'redeem' || s.requestId) return state;
      return { ...state, screen: { ...s, mode: action.mode, error: null } };
    case 'redeem/input':
      if (s.name !== 'redeem' || s.requestId) return state;
      return { ...state, screen: { ...s, input: action.value, error: null } };
    case 'redeem/detected': {
      if (s.name !== 'redeem' || s.requestId) return state;
      const text = action.text.trim();
      // A member card shown by mistake: look the member up instead.
      if (parseToken(text)) return startScan(state, action.requestId, text);
      const code = normalizeRedemptionCode(text);
      return { ...state, screen: { ...s, mode: 'type', input: code ?? text, error: code ? null : 'not_found' } };
    }
    case 'redeem/submit': {
      if (s.name !== 'redeem' || s.requestId || !state.cashier) return state;
      const code = normalizeRedemptionCode(s.input);
      if (!code) return { ...state, screen: { ...s, error: 'not_found' } };
      return {
        ...state,
        screen: { ...s, requestId: action.requestId, error: null, retry: keyFor(s.retry, code, action.idempotencyKey, action.now) },
      };
    }
    case 'redeem/succeeded':
      if (s.name !== 'redeem' || s.requestId !== action.requestId) return state;
      return { ...state, screen: { name: 'redeemed', result: action.result } };
    case 'redeem/failed':
      if (s.name !== 'redeem' || s.requestId !== action.requestId) return state;
      return {
        ...state,
        screen: { ...s, requestId: null, error: action.error, retry: isRetryable(action.error) ? s.retry : null },
      };

    // --- Navigation ------------------------------------------------------
    case 'next':
      if (!state.cashier || isBusy(state)) return state;
      if (!['idle', 'member', 'amount', 'done', 'error', 'redeem', 'redeemed'].includes(s.name)) return state;
      return { ...state, todayOpen: false, screen: scanScreen() };
    case 'today/open':
      if (!state.cashier || !state.store) return state;
      return { ...state, todayOpen: true };
    case 'today/close':
      return state.todayOpen ? { ...state, todayOpen: false } : state;

    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
