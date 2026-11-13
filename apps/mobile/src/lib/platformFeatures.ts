/*
 * What differs between the web app and the store apps (iOS, Android).
 *
 * Store review rules: a store build shows no disabled "coming soon" buttons,
 * never mentions the other platform (no Google Wallet on iOS), and doesn't tell
 * people they don't need an app. So the native apps show a Wallet button (and
 * Wallet copy) only for a pass the brand has switched on (`walletInApp` in
 * src/brand/<brand>.ts), and only their own platform's. The web keeps both
 * (placeholders until the passes ship).
 */
import { brand } from '../brand';

export type AppPlatform = "ios" | "android" | "web" | (string & {});
export type WalletKind = "apple" | "google";
export interface WalletLive {
  apple: boolean;
  google: boolean;
}

/** This brand's passes that work (src/brand/<brand>.ts `walletInApp`). */
export const brandWallets: WalletLive = {
  apple: brand.walletInApp?.apple === true,
  google: brand.walletInApp?.google === true,
};

/** The Wallet buttons to show on this platform. */
export function walletButtons(os: AppPlatform, live: WalletLive = brandWallets): WalletKind[] {
  if (os === "web") return ["apple", "google"];
  if (os === "ios") return live.apple ? ["apple"] : [];
  if (os === "android") return live.google ? ["google"] : [];
  return [];
}

/** Wallet copy ("add it to your Wallet", the card's Wallet hint): only where a Wallet button is shown. */
export function showsWalletCopy(os: AppPlatform, live: WalletLive = brandWallets): boolean {
  return walletButtons(os, live).length > 0;
}

/** "No app needed" (landing note, the FAQ's app question): only on the web. */
export function showsNoAppCopy(os: AppPlatform): boolean {
  return os === "web";
}
