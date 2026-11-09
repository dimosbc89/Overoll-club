import type { Translate } from '../i18n/messages';
import type { Loaded } from '../lib/data';

/** Message for data that could not be shown: env missing or query failed. */
export function LoadNotice({ state, t }: { state: Exclude<Loaded<unknown>, { status: 'ready' }>; t: Translate }) {
  const configured = state.status !== 'not_configured';
  return (
    <div className="notice" role={configured ? 'alert' : 'status'}>
      <p className="notice-title">{t(configured ? 'state.errorTitle' : 'state.notConfiguredTitle')}</p>
      <p>{t(configured ? 'state.errorBody' : 'state.notConfiguredBody')}</p>
    </div>
  );
}
