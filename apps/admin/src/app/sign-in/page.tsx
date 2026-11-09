import type { Metadata } from 'next';

import { getI18n } from '../../i18n/server';
import styles from './sign-in.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('signIn.title') };
}

/** Sign-in placeholder: staff accounts (Supabase Auth + staff_roles) come next. */
export default async function SignInPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t('signIn.title')}</h1>
      <p className="intro">{t('signIn.body')}</p>
      <form className={styles.form} aria-disabled="true">
        <label htmlFor="email">{t('signIn.email')}</label>
        <input id="email" name="email" type="email" autoComplete="email" disabled className={styles.input} />
        <button type="submit" className="button" disabled>
          {t('signIn.submit')}
        </button>
      </form>
    </>
  );
}
