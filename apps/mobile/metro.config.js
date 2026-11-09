// Metro config: Expo's defaults, plus one rule for the workspace packages.
// packages/* are ESM TypeScript that import siblings as "./config.js" (Node
// and Deno resolve that to config.ts); Metro needs to be told to try ".ts".
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const packagesDir = path.resolve(__dirname, '../../packages') + path.sep;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromPackage = context.originModulePath.startsWith(packagesDir);
  if (fromPackage && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, `${moduleName.slice(0, -3)}.ts`, platform);
    } catch {
      // Not a TypeScript sibling: fall through to the normal lookup.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
