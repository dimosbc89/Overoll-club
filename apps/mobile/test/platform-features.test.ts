import { describe, expect, it } from "vitest";

import {
  showsNoAppCopy,
  showsWalletCopy,
  walletButtons,
} from "../src/lib/platformFeatures";

describe("platform features", () => {
  it("keeps both Wallet placeholders on the web", () => {
    expect(walletButtons("web", false)).toEqual(["apple", "google"]);
    expect(showsWalletCopy("web", false)).toBe(true);
  });

  it("shows no Wallet button or copy in the store apps until the passes exist", () => {
    expect(walletButtons("ios", false)).toEqual([]);
    expect(walletButtons("android", false)).toEqual([]);
    expect(showsWalletCopy("ios", false)).toBe(false);
  });

  it("shows only the platform’s own Wallet in each store app once the passes exist", () => {
    expect(walletButtons("ios", true)).toEqual(["apple"]);
    expect(walletButtons("android", true)).toEqual(["google"]);
  });

  it('says "no app needed" only on the web', () => {
    expect(showsNoAppCopy("web")).toBe(true);
    expect(showsNoAppCopy("ios")).toBe(false);
    expect(showsNoAppCopy("android")).toBe(false);
  });
});
