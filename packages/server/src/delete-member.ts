import { audit } from './internal/audit.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { memberBalance } from './internal/members.js';
import { type Db, type Result, type Tx, fail } from './result.js';

export interface DeleteMemberInput {
  /** The signed-in user deleting their own account. */
  callerUserId: string;
  /** The member typed the confirmation word in the app: must be `true`. */
  confirm: boolean;
  /** Required like every write; deletion is idempotent by itself (see below). */
  idempotencyKey: string;
  now?: Date;
}

export type DeleteMemberError = 'invalid_input' | 'forbidden';

export interface DeletedAccount {
  /** Members wiped by this call (one per brand the user joined); empty when a retry finds them already deleted. */
  memberIds: string[];
  /** Pending codes cancelled without giving the points back. */
  codesCancelled: number;
  /**
   * The Supabase Auth user was deleted in the same transaction (or was
   * already gone). `false` when the database role may not delete from
   * `auth.users`: the caller (the Edge Function) then deletes the user with
   * the Auth admin API.
   */
  authUserDeleted: boolean;
}

export type DeleteMemberResult = Result<DeletedAccount, DeleteMemberError>;

function parse(raw: DeleteMemberInput) {
  if (raw.confirm !== true) throw new InputError('confirm must be true');
  return {
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  };
}

/**
 * The member deletes their account (Apple requires deletion in the app; GDPR).
 * One transaction, under the member lock:
 *
 * - pending codes are cancelled and their points are NOT returned (the
 *   account is closing; program spec "Rejoining": old points are not
 *   restored); the welcome gift, if not used, is closed (`expired`);
 * - the personal fields are wiped (first name emptied; last name, email,
 *   phone, birthday, referral code and the auth link removed; consents off),
 *   `deleted_at` is set and the QR secret is deleted, so the app card, a
 *   screenshot and a Wallet pass stop working;
 * - stored request/results that hold personal data are removed
 *   (`private.idempotency_keys`: the user's own calls, first names in the
 *   till's results);
 * - the ledger stays as it is (append-only); the balance left expires like
 *   anyone's (`expirePoints`);
 * - an `audit_log` row `member.delete`;
 * - last, the Supabase Auth user is deleted, so the same email can join again
 *   later as a new member.
 *
 * Staff accounts are refused (`forbidden`): HQ removes them in the back office.
 * A user who signed in but never joined only loses the auth user.
 *
 * Idempotent without a stored result: a retry (or a second tap) finds nothing
 * left to wipe and answers `ok` again with `memberIds: []`.
 */
export async function deleteMember(sql: Db, raw: DeleteMemberInput): Promise<DeleteMemberResult> {
  const parsed = input.parseInput(() => parse(raw));
  if ('failure' in parsed) return parsed.failure;
  const { callerUserId, now } = parsed.input;

  return sql.begin(async (tx): Promise<DeleteMemberResult> => {
    const [staff] = await tx`select 1 from public.staff_roles where user_id = ${callerUserId} limit 1`;
    if (staff) return fail('forbidden', 'Staff accounts are removed by HQ, not from the app');

    // One row per brand the user joined; locked in id order.
    const members = await tx<{ id: string; brand_id: string }[]>`
      select id, brand_id from public.members
      where user_id = ${callerUserId} and deleted_at is null
      order by id
      for update
    `;
    let codesCancelled = 0;
    for (const member of members) codesCancelled += await wipeMember(tx, member, callerUserId, now);

    // The user's own stored calls (join keeps name, email, phone, birthday in its fingerprint).
    await tx`delete from private.idempotency_keys where actor_user_id = ${callerUserId}`;

    const authUserDeleted = await deleteAuthUser(tx, callerUserId);
    return { ok: true, memberIds: members.map((m) => m.id), codesCancelled, authUserDeleted };
  });
}

/** Wipe one locked member; returns how many pending codes were cancelled. */
async function wipeMember(tx: Tx, member: { id: string; brand_id: string }, callerUserId: string, now: Date): Promise<number> {
  // Gifts first: an unused gift (available, or held by a pending code) closes with the account.
  const gifts = await tx<{ id: string }[]>`
    update public.member_gifts set status = 'expired', redemption_id = null
    where member_id = ${member.id}
      and (
        status = 'available'
        or (status = 'redeemed' and redemption_id in (
          select id from public.redemptions where member_id = ${member.id} and status = 'pending'
        ))
      )
    returning id
  `;
  // No refund_redeem entry: the points of a cancelled code are not returned.
  const codes = await tx<{ id: string }[]>`
    update public.redemptions set status = 'cancelled', cancelled_at = ${now}
    where member_id = ${member.id} and status = 'pending'
    returning id
  `;
  const pointsLeft = await memberBalance(tx, member.id);

  await tx`
    update public.members set
      user_id = null, first_name = '', last_name = null, email = null, phone = null, birthday = null,
      referral_code = null, consent_email = false, consent_sms = false, consent_push = false,
      deleted_at = ${now}
    where id = ${member.id}
  `;
  await tx`delete from public.member_secrets where member_id = ${member.id}`;
  // First names in stored results of the till (redemptions/use) and of join.
  await tx`
    update private.idempotency_keys set result = jsonb_set(result, '{memberFirstName}', '""')
    where result ->> 'memberId' = ${member.id} and result ? 'memberFirstName'
  `;
  await tx`
    update private.idempotency_keys set result = jsonb_set(result, '{firstName}', '""')
    where result ->> 'memberId' = ${member.id} and result ? 'firstName'
  `;

  await audit(tx, {
    brandId: member.brand_id,
    actorUserId: callerUserId,
    action: 'member.delete',
    entity: 'members',
    entityId: member.id,
    details: { codesCancelled: codes.length, giftsClosed: gifts.length, pointsLeft },
    at: now,
  });
  return codes.length;
}

/**
 * Delete the Supabase Auth user in the same transaction. In production the
 * server connects as `postgres` (SUPABASE_DB_URL), which may delete from
 * `auth.users`; if this role may not (42501), the savepoint keeps the rest of
 * the transaction and the caller deletes the user with the Auth admin API.
 */
async function deleteAuthUser(tx: Tx, userId: string): Promise<boolean> {
  try {
    await tx.savepoint((sp) => sp`delete from auth.users where id = ${userId}`);
    return true;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === '42501') return false;
    throw error;
  }
}
