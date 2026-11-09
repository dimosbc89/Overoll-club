import type { MessageKey } from '../i18n/messages';
import { getI18n } from '../i18n/server';
import styles from './page.module.css';

const stats: MessageKey[] = ['dashboard.members', 'dashboard.pointsWeek', 'dashboard.redemptionsWeek'];

/** HQ dashboard. Placeholder: numbers come with the back office (roadmap week 4). */
export default async function DashboardPage() {
  const { t } = await getI18n();
  return (
    <>
      <div>
        <h1>{t('dashboard.title')}</h1>
        <p className="intro">{t('dashboard.intro')}</p>
      </div>
      <ul className={styles.stats}>
        {stats.map((key) => (
          <li key={key} className={styles.stat}>
            <span className={styles.statLabel}>{t(key)}</span>
            <span className={styles.statValue}>{t('dashboard.noValue')}</span>
          </li>
        ))}
      </ul>
      <p className="notice" role="status">
        {t('dashboard.placeholder')}
      </p>
    </>
  );
}
