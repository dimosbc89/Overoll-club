/*
 * What differs between the web app and the store apps (iOS, Android).
 *
 * Store review rules: a store build shows no disabled "coming soon" buttons,
 * never mentions the other platform (no Google Wallet on iOS), and doesn't tell
 * people they don't need an app. So until the Wallet passes exist, the native
 * apps show no Wallet buttons or Wallet copy; afterwards each shows only its own
 * platform's Wallet. The web keeps both (placeholders until the passes ship).
 */

export type AppPlatform = "ios" | "android" | "web" | (string & {});
export type WalletKind = "apple" | "google";

/** Flip to true when the Wallet passes are built and served (roadmap: Wallet). */
export const WALLET_PASSES_LIVE = false;

/** The Wallet buttons to show on this platform. */
export function walletButtons(
  os: AppPlatform,
  passesLive: boolean = WALLET_PASSES_LIVE,
): WalletKind[] {
  if (os === "web") return ["apple", "google"];
  if (!passesLive) return [];
  if (os === "ios") return ["apple"];
  if (os === "android") return ["google"];
  return [];
}

/** Wallet copy ("add it to your Wallet", the card's Wallet hint): only where a Wallet button is shown. */
export function showsWalletCopy(
  os: AppPlatform,
  passesLive: boolean = WALLET_PASSES_LIVE,
): boolean {
  return walletButtons(os, passesLive).length > 0;
}

/** "No app needed" (landing note, the FAQ's app question): only on the web. */
export function showsNoAppCopy(os: AppPlatform): boolean {
  return os === "web";
}
