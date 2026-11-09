'use client';

import { LoadNotice } from '../../../components/Notice';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import { loadRewards, useLoaded } from '../../../lib/data';
import { formatEuroFromCents, formatPoints } from '../../../lib/format';
import { rewardCosts } from '../../../lib/reward-costs';

/** Reward catalog with the point cost per tier, computed by @overoll/core. */
export default function RewardsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle(t('rewards.title'));
  const rewards = useLoaded(loadRewards);

  return (
    <>
      <div>
        <h1>{t('rewards.title')}</h1>
        <p className="intro">{t('rewards.intro')}</p>
      </div>
      {rewards.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : rewards.status !== 'ready' ? (
        <LoadNotice state={rewards} t={t} />
      ) : rewards.data.length === 0 ? (
        <p>{t('rewards.empty')}</p>
      ) : (
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
      )}
    </>
  );
}
