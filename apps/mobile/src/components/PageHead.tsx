import Head from 'expo-router/head';

/**
 * The browser tab title (and description) of a page in the web app.
 * Native builds use PageHead.native.tsx instead: on iOS, expo-router's Head
 * also sets up Handoff and alerts when no web origin is configured.
 */
export function PageHead({ title, description }: { title: string; description?: string }) {
  return (
    <Head>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
    </Head>
  );
}
