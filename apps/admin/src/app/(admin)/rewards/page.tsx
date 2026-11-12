'use client';

import { rewardBaseCost } from '@grow-loyalty/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

import { LoadNotice } from '../../../components/Notice';
import { OfficeGate, useOffice } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useLoad } from '../../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import { errorMessage, newIdempotencyKey } from '../../../lib/api';
import { centsToEuroInput, parseEuroToCents } from '../../../lib/catalog';
import { loadRewards, useLoaded } from '../../../lib/data';
import { formatEuroFromCents, formatPoints } from '../../../lib/format';
import { loadCatalogRewards, type CatalogReward, type OfficeApi, type OfficeUser, type RewardInput, type TierName } from '../../../lib/office';
import { rewardCosts } from '../../../lib/reward-costs';

/** Reward catalog with the point cost per tier (core); HQ admins also edit it (v0.6). */
export default function RewardsPage() {
  const { t } = useI18n();
  useDocumentTitle(t('rewards.title'));
  const { session } = useOffice();
  const hq = session.status === 'ready' && session.user.hq && !session.user.deviceOnly;

  return (
    <>
      <div>
        <h1>{t('rewards.title')}</h1>
        <p className="intro">{t(hq ? 'rewards.introHq' : 'rewards.intro')}</p>
      </div>
      {session.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : hq ? (
        <OfficeGate need="hq">{(ctx) => <RewardEditor {...ctx} />}</OfficeGate>
      ) : (
        <PublicRewards />
      )}
    </>
  );
}

/** Active rewards, readable without signing in. */
function PublicRewards() {
  const { t, locale } = useI18n();
  const rewards = useLoaded(loadRewards);

  if (rewards.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (rewards.status !== 'ready') return <LoadNotice state={rewards} t={t} />;
  if (rewards.data.length === 0) return <p>{t('rewards.empty')}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('rewards.colNameEl')}</th>
            <th scope="col">{t('rewards.colNameEn')}</th>
            <th scope="col" className="num">
              {t('rewards.colPrice')}
            </th>
            <th scope="col" className="num">
              {t('rewards.colClassic')}
            </th>
            <th scope="col" className="num">
              {t('rewards.colGold')}
            </th>
            <th scope="col" className="num">
              {t('rewards.colClub')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rewards.data.map((reward) => {
            const costs = rewardCosts(reward.base_cost);
            return (
              <tr key={reward.id}>
                <th scope="row" lang="el">
                  {reward.name_el}
                </th>
                <td lang="en">{reward.name_en}</td>
                <td className="num">{formatEuroFromCents(reward.shelf_price_cents, locale)}</td>
                <td className="num">{formatPoints(costs.classic, locale)}</td>
                <td className="num">{formatPoints(costs.gold, locale)}</td>
                <td className="num">{formatPoints(costs.club, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HQ editor
// ---------------------------------------------------------------------------

type Ctx = { user: OfficeUser; client: SupabaseClient; api: OfficeApi };
type Message = { ok: boolean; text: string };
const TIERS: readonly TierName[] = ['classic', 'gold', 'club'];

function RewardEditor({ user, client, api }: Ctx) {
  const { t, locale } = useI18n();
  const rewards = useLoad(() => loadCatalogRewards(client, user.brandId), `catalog-rewards:${user.brandId}`);
  const [form, setForm] = useState<{ reward: CatalogReward | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const welcomeId = user.config.welcome.rewardId ?? null;
  const nameOf = (r: { nameEl: string; nameEn: string }) => (locale === 'en' ? r.nameEn : r.nameEl);

  async function setActive(reward: CatalogReward, active: boolean) {
    setBusy(true);
    setMessage(null);
    const result = await api.updateReward({ rewardId: reward.id, active });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t(active ? 'rewards.switchedOn' : 'rewards.switchedOff', { name: nameOf(reward) }) });
    rewards.reload();
  }

  if (rewards.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (rewards.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }
  const categories = [...new Set(rewards.data.map((r) => r.category))].sort();

  return (
    <section className={styles.section} aria-label={t('rewards.title')}>
      {rewards.data.length === 0 ? (
        <p>{t('rewards.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('rewards.colReward')}</th>
                <th scope="col" className="num">
                  {t('rewards.colPrice')}
                </th>
                <th scope="col" className="num">
                  {t('rewards.colClassic')}
                </th>
                <th scope="col" className="num">
                  {t('rewards.colGold')}
                </th>
                <th scope="col" className="num">
                  {t('rewards.colClub')}
                </th>
                <th scope="col">{t('rewards.colMinTier')}</th>
                <th scope="col">{t('catalog.colStatus')}</th>
                <th scope="col">{t('catalog.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rewards.data.map((reward) => {
                const costs = rewardCosts(reward.baseCost, user.config);
                const welcome = reward.id === welcomeId;
                return (
                  <tr key={reward.id}>
                    <th scope="row" className={reward.active ? undefined : styles.muted}>
                      <span lang="el">{reward.nameEl}</span>
                      <span lang="en" className={styles.subline}>
                        {reward.nameEn}
                      </span>
                    </th>
                    <td className="num">{formatEuroFromCents(reward.shelfPriceCents, locale)}</td>
                    <td className="num">{formatPoints(costs.classic, locale)}</td>
                    <td className="num">{formatPoints(costs.gold, locale)}</td>
                    <td className="num">{formatPoints(costs.club, locale)}</td>
                    <td>{reward.minTier ? t(`tier.${reward.minTier}`) : t('rewards.allTiers')}</td>
                    <td>
                      <div className={styles.actions}>
                        <span className={styles.tag}>{t(reward.active ? 'rewards.statusActive' : 'rewards.statusInactive')}</span>
                        {welcome ? <span className={styles.tag}>{t('rewards.welcomeTag')}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.small}
                          disabled={busy}
                          onClick={() => {
                            setMessage(null);
                            setForm({ reward });
                          }}
                        >
                          {t('catalog.edit')}
                        </button>
                        {welcome && reward.active ? null : (
                          <button type="button" className={styles.small} disabled={busy} onClick={() => void setActive(reward, !reward.active)}>
                            {t(reward.active ? 'rewards.switchOff' : 'rewards.switchOn')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {message ? (
        <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}
      {form ? (
        <RewardForm
          key={form.reward?.id ?? 'new'}
          reward={form.reward}
          categories={categories}
          user={user}
          api={api}
          onDone={(done) => {
            setForm(null);
            setMessage(done);
            rewards.reload();
          }}
          onCancel={() => setForm(null)}
        />
      ) : (
        <div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMessage(null);
              setForm({ reward: null });
            }}
          >
            {t('rewards.add')}
          </button>
        </div>
      )}
    </section>
  );
}

function RewardForm({
  reward,
  categories,
  user,
  api,
  onDone,
  onCancel,
}: {
  reward: CatalogReward | null;
  categories: string[];
  user: OfficeUser;
  api: OfficeApi;
  onDone(message: Message): void;
  onCancel(): void;
}) {
  const { t, locale } = useI18n();
  const [nameEl, setNameEl] = useState(reward?.nameEl ?? '');
  const [nameEn, setNameEn] = useState(reward?.nameEn ?? '');
  const [descEl, setDescEl] = useState(reward?.descriptionEl ?? '');
  const [descEn, setDescEn] = useState(reward?.descriptionEn ?? '');
  const [price, setPrice] = useState(reward ? centsToEuroInput(reward.shelfPriceCents, locale) : '');
  const [minTier, setMinTier] = useState<TierName | ''>(reward?.minTier ?? '');
  const [order, setOrder] = useState(reward ? String(reward.sortOrder) : '');
  const [category, setCategory] = useState(reward?.category ?? categories[0] ?? 'other');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [createKey] = useState(newIdempotencyKey);
  const titleId = `reward-form-${reward?.id ?? 'new'}`;

  const cents = parseEuroToCents(price);
  const preview = cents
    ? (() => {
        const costs = rewardCosts(rewardBaseCost(cents, user.config), user.config);
        return TIERS.map((tier) => `${t(`tier.${tier}`)} ${formatPoints(costs[tier], locale)}`).join(' · ');
      })()
    : null;
  const priceChanged = reward !== null && cents !== null && cents !== reward.shelfPriceCents;
  const allCategories = [...new Set([...categories, category])].sort();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setProblem(null);
    if (!cents) {
      setProblem(t('rewards.priceInvalid'));
      return;
    }
    const orderValue = order.trim() === '' ? undefined : Number(order.trim());
    if (orderValue !== undefined && (!Number.isInteger(orderValue) || orderValue < 0 || orderValue > 100_000)) {
      setProblem(t('rewards.orderInvalid'));
      return;
    }
    const fields: RewardInput = {
      nameEl,
      nameEn,
      descriptionEl: descEl.trim() || null,
      descriptionEn: descEn.trim() || null,
      category,
      shelfPriceCents: cents,
      minTier: minTier || null,
      ...(orderValue === undefined ? {} : { sortOrder: orderValue }),
    };
    setBusy(true);
    const result = reward
      ? await api.updateReward({ rewardId: reward.id, ...fields })
      : await api.createReward({ ...fields, brandId: user.brandId, nameEl, nameEn, shelfPriceCents: cents, idempotencyKey: createKey });
    setBusy(false);
    if (!result.ok) {
      setProblem(errorMessage(result.code, locale, user.config));
      return;
    }
    const shown = locale === 'en' ? result.reward.nameEn : result.reward.nameEl;
    onDone({ ok: true, text: t(reward ? 'rewards.saved' : 'rewards.created', { name: shown }) });
  }

  return (
    <form className={`${styles.form} ${styles.editor}`} aria-labelledby={titleId} onSubmit={(e) => void submit(e)} noValidate>
      <h2 id={titleId} className={styles.sectionTitle}>
        {reward ? t('rewards.formEdit', { name: locale === 'en' ? reward.nameEn : reward.nameEl }) : t('rewards.formNew')}
      </h2>
      <div className={styles.grid}>
        <label className={styles.field}>
          {t('rewards.fieldNameEl')}
          <input className={styles.input} lang="el" required maxLength={60} value={nameEl} onChange={(e) => setNameEl(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('rewards.fieldNameEn')}
          <input className={styles.input} lang="en" required maxLength={60} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('rewards.fieldDescEl')}
          <textarea className={`${styles.input} ${styles.textarea}`} lang="el" maxLength={200} value={descEl} onChange={(e) => setDescEl(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('rewards.fieldDescEn')}
          <textarea className={`${styles.input} ${styles.textarea}`} lang="en" maxLength={200} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('rewards.fieldPrice')}
          <input
            className={styles.input}
            inputMode="decimal"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-describedby="reward-price-hint reward-cost-preview"
          />
          <span id="reward-price-hint" className={styles.hint}>
            {t('rewards.priceHint')}
          </span>
        </label>
        <label className={styles.field}>
          {t('rewards.fieldMinTier')}
          <select className={styles.select} value={minTier} onChange={(e) => setMinTier(e.target.value as TierName | '')}>
            <option value="">{t('rewards.allTiers')}</option>
            {TIERS.filter((tier) => tier !== 'classic').map((tier) => (
              <option key={tier} value={tier}>
                {t(`tier.${tier}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {t('rewards.fieldOrder')}
          <input className={styles.input} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} aria-describedby="reward-order-hint" />
          <span id="reward-order-hint" className={styles.hint}>
            {t('rewards.orderHint')}
          </span>
        </label>
        <label className={styles.field}>
          {t('rewards.fieldCategory')}
          <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div id="reward-cost-preview" aria-live="polite">
        {preview ? <p className={styles.preview}>{t('rewards.costPreview', { costs: preview })}</p> : null}
        {priceChanged ? <p className={styles.hint}>{t('rewards.priceChangeNote')}</p> : null}
      </div>
      {problem ? (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="button" disabled={busy || !nameEl.trim() || !nameEn.trim() || !price.trim()}>
          {t('catalog.save')}
        </button>
        <button type="button" className={styles.small} onClick={onCancel}>
          {t('catalog.cancel')}
        </button>
      </div>
    </form>
  );
}
