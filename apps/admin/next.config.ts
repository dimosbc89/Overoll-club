import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @overoll/core ships TypeScript source (the program rules); compile it here.
  transpilePackages: ['@overoll/core'],
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
