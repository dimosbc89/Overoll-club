import type { TierId } from '@overoll/core';
import { audit } from './internal/audit.js';
import { findBrandBySlug } from './internal/brand.js';
import { idempotent } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { type Db, type Result, fail } from './result.js';

export interface JoinMemberInput {
  /** The signed-in user (auth.users id) joining. */
  userId: string;
  brandSlug: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** YYYY-MM-DD */
  birthday?: string | null;
  /** Defaults to the brand's default locale. */
  locale?: 'el' | 'en' | null;
  /** Store code from the counter QR join link, e.g. "chalandri". */
  joinedStoreCode?: string | null;
  consents?: { email?: boolean; sms?: boolean; push?: boolean } | null;
  /** Another member's referral code. */
  referralCode?: string | null;
  idempotencyKey: string;
  now?: Date;
}

export type JoinMemberError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'brand_not_found'
  | 'store_not_found'
  | 'referral_not_found'
  | 'email_taken'
  | 'phone_taken'
  | 'member_deleted';

export interface JoinedMember {
  memberId: string;
  memberCode: string;
  firstName: string;
  tier: TierId;
  locale: 'el' | 'en';
  /** false when the user had already joined this brand (the existing member is returned). */
  created: boolean;
}

export type JoinMemberResult = Result<JoinedMember, JoinMemberError>;

function parse(raw: JoinMemberInput) {
  const brandSlug = input.text(raw.brandSlug, 'brandSlug', 64);
  if (!/^[a-z0-9-]+$/.test(brandSlug)) throw new InputError('brandSlug is not a valid slug');
  const firstName = input.optionalText(raw.firstName, 'firstName', 50);
  if (!firstName) throw new InputError('firstName is required');

  const email = input.optionalText(raw.email, 'email', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('email is not valid');

  const phoneText = input.optionalText(raw.phone, 'phone', 30);
  const phone = phoneText ? phoneText.replace(/[\s().-]/g, '') : null;
  if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) throw new InputError('phone is not valid');

  const birthday = input.optionalText(raw.birthday, 'birthday', 10);
  if (birthday) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
    const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
    if (!date || date.toISOString().slice(0, 10) !== birthday || date.getUTCFullYear() < 1900) {
      throw new InputError('birthday must be a date as YYYY-MM-DD');
    }
  }

  const locale = raw.locale ?? null;
  if (locale !== null && locale !== 'el' && locale !== 'en') throw new InputError('locale must be el or en');

  const joinedStoreCode = input.optionalText(raw.joinedStoreCode, 'joinedStoreCode', 64);
  if (joinedStoreCode && !/^[a-z0-9-]+$/.test(joinedStoreCode)) throw new InputError('joinedStoreCode is not valid');

  const referral = input.optionalText(raw.referralCode, 'referralCode', 16);
  const referralCode = referral ? referral.toUpperCase() : null;
  if (referralCode && !/^[A-Z0-9]{6,16}$/.test(referralCode)) throw new InputError('referralCode is not valid');

  const consents = raw.consents ?? {};
  for (const key of ['email', 'sms', 'push'] as const) {
    const v = consents[key];
    if (v !== undefined && typeof v !== 'boolean') throw new InputError(`consents.${key} must be true or false`);
  }

  return {
    userId: input.uuid(raw.userId, 'userId'),
    brandSlug,
    firstName,
    lastName: input.optionalText(raw.lastName, 'lastName', 50),
    email,
    phone,
    birthday,
    locale,
    joinedStoreCode,
    referralCode,
    consentEmail: consents.email ?? false,
    consentSms: consents.sms ?? false,
    consentPush: consents.push ?? false,
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  };
}

const uniqueFailures: Record<string, 'email_taken' | 'phone_taken'> = {
  members_brand_email_key: 'email_taken',
  members_brand_phone_key: 'phone_taken',
};

/**
 * A signed-in user joins a brand's program: creates the member and its QR
 * secret. Joining again returns the existing member (created: false).
 */
export async function joinMember(sql: Db, raw: JoinMemberInput): Promise<JoinMemberResult> {
  const parsed = input.parseInput(() => parse(raw));
  if ('failure' in parsed) return parsed.failure;
  const { idempotencyKey, now, ...request } = parsed.input;
  const i = parsed.input;

  try {
    return await sql.begin(async (tx): Promise<JoinMemberResult> => {
      const brand = await findBrandBySlug(tx, i.brandSlug);
      if (!brand) return fail('brand_not_found');

      return idempotent(
        tx,
        { brandId: brand.id, key: idempotencyKey, operation: 'join_member', actorUserId: i.userId, request, now },
        async (): Promise<JoinMemberResult> => {
          type MemberRow = { id: string; member_code: string; first_name: string; tier: TierId; locale: 'el' | 'en'; deleted_at: Date | null };
          const existingMember = (row: MemberRow): JoinMemberResult =>
            row.deleted_at
              ? fail('member_deleted', 'This account deleted its membership')
              : { ok: true, memberId: row.id, memberCode: row.member_code, firstName: row.first_name, tier: row.tier, locale: row.locale, created: false };

          const [existing] = await tx<MemberRow[]>`
            select id, member_code, first_name, tier, locale, deleted_at
            from public.members where brand_id = ${brand.id} and user_id = ${i.userId}
          `;
          if (existing) return existingMember(existing);

          let joinedStoreId: string | null = null;
          if (i.joinedStoreCode) {
            const [store] = await tx<{ id: string }[]>`
              select id from public.stores where brand_id = ${brand.id} and code = ${i.joinedStoreCode} and active
            `;
            if (!store) return fail('store_not_found');
            joinedStoreId = store.id;
          }

          let referredBy: string | null = null;
          if (i.referralCode) {
            const [referrer] = await tx<{ id: string }[]>`
              select id from public.members
              where brand_id = ${brand.id} and referral_code = ${i.referralCode} and deleted_at is null
            `;
            if (!referrer) return fail('referral_not_found');
            referredBy = referrer.id;
          }

          if (i.email) {
            const [taken] = await tx`
              select 1 from public.members
              where brand_id = ${brand.id} and lower(email) = lower(${i.email}) and deleted_at is null
            `;
            if (taken) return fail('email_taken');
          }
          if (i.phone) {
            const [taken] = await tx`
              select 1 from public.members where brand_id = ${brand.id} and phone = ${i.phone} and deleted_at is null
            `;
            if (taken) return fail('phone_taken');
          }

          const locale = i.locale ?? brand.defaultLocale;
          const [created] = await tx<MemberRow[]>`
            insert into public.members (
              brand_id, user_id, first_name, last_name, email, phone, birthday, locale,
              joined_store_id, referred_by, consent_email, consent_sms, consent_push,
              consents_updated_at, created_at
            ) values (
              ${brand.id}, ${i.userId}, ${i.firstName}, ${i.lastName}, ${i.email}, ${i.phone}, ${i.birthday}, ${locale},
              ${joinedStoreId}, ${referredBy}, ${i.consentEmail}, ${i.consentSms}, ${i.consentPush},
              ${now}, ${now}
            )
            on conflict (brand_id, user_id) do nothing
            returning id, member_code, first_name, tier, locale, deleted_at
          `;
          if (!created) {
            // A concurrent join for the same user won the race: return that member.
            const [winner] = await tx<MemberRow[]>`
              select id, member_code, first_name, tier, locale, deleted_at
              from public.members where brand_id = ${brand.id} and user_id = ${i.userId}
            `;
            if (!winner) throw new Error('Member insert conflicted but no member was found');
            return existingMember(winner);
          }
          await tx`insert into public.member_secrets (member_id) values (${created.id})`;
          await audit(tx, {
            brandId: brand.id,
            actorUserId: i.userId,
            action: 'member.join',
            entity: 'members',
            entityId: created.id,
            details: {
              joinedStoreId,
              referredBy,
              consentEmail: i.consentEmail,
              consentSms: i.consentSms,
              consentPush: i.consentPush,
            },
            at: now,
          });
          return {
            ok: true,
            memberId: created.id,
            memberCode: created.member_code,
            firstName: created.first_name,
            tier: created.tier,
            locale: created.locale,
            created: true,
          };
        },
      );
    });
  } catch (error) {
    // Lost a race with another account registering the same email or phone.
    const pgError = error as { code?: unknown; constraint_name?: unknown } | null;
    if (pgError?.code === '23505' && typeof pgError.constraint_name === 'string') {
      const code = uniqueFailures[pgError.constraint_name];
      if (code) return fail(code);
    }
    throw error;
  }
}
