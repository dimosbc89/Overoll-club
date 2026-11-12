import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static site for Cloudflare Pages (admin.loyalty.overoll.gr): everything runs in the
  // browser against Supabase and the API, so there is no Next.js server.
  output: 'export',
  images: { unoptimized: true },
  // @grow-loyalty/core ships TypeScript source (the program rules); compile it here.
  transpilePackages: ['@grow-loyalty/core'],
  experimental: {
    // Core imports its own files as './config.js' (TypeScript ESM style).
    // Turbopack can't map those to .ts yet, so dev and build use webpack
    // (`--webpack` in package.json) with this alias.
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
