import type { Metadata } from 'next';

import { LoadNotice } from '../../components/Notice';
import { getI18n } from '../../i18n/server';
import { loadRewards } from '../../lib/data';
import { formatEuroFromCents, formatPoints } from '../../lib/format';
import { rewardCosts } from '../../lib/reward-costs';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('rewards.title') };
}

/** Reward catalog with the point cost per tier, computed by @overoll/core. */
export default async function RewardsPage() {
  const { t, locale } = await getI18n();
  const rewards = await loadRewards();

  return (
    <>
      <div>
        <h1>{t('rewards.title')}</h1>
        <p className="intro">{t('rewards.intro')}</p>
      </div>
      {rewards.status !== 'ready' ? (
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
