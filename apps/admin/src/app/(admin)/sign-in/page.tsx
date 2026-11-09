'use client';

import { useDocumentTitle, useI18n } from '../../../i18n/client';
import styles from './sign-in.module.css';

/** Sign-in placeholder: staff accounts (Supabase Auth + staff_roles) come next. */
export default function SignInPage() {
  const { t } = useI18n();
  useDocumentTitle(t('signIn.title'));
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
