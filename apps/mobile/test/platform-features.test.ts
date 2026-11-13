import { describe, expect, it } from "vitest";

import {
  showsNoAppCopy,
  showsWalletCopy,
  walletButtons,
} from "../src/lib/platformFeatures";

const none = { apple: false, google: false };
const both = { apple: true, google: true };

describe("platform features", () => {
  it("keeps both Wallet placeholders on the web", () => {
    expect(walletButtons("web", none)).toEqual(["apple", "google"]);
    expect(showsWalletCopy("web", none)).toBe(true);
  });

  it("shows no Wallet button or copy in the store apps until the passes exist", () => {
    expect(walletButtons("ios", none)).toEqual([]);
    expect(walletButtons("android", none)).toEqual([]);
    expect(showsWalletCopy("ios", none)).toBe(false);
  });

  it("shows only the platform’s own Wallet in each store app once the passes exist", () => {
    expect(walletButtons("ios", both)).toEqual(["apple"]);
    expect(walletButtons("android", both)).toEqual(["google"]);
  });

  it("switches each platform on by itself (Apple Wallet live, Google not yet)", () => {
    const appleOnly = { apple: true, google: false };
    expect(walletButtons("ios", appleOnly)).toEqual(["apple"]);
    expect(walletButtons("android", appleOnly)).toEqual([]);
    expect(showsWalletCopy("android", appleOnly)).toBe(false);
  });

  it('says "no app needed" only on the web', () => {
    expect(showsNoAppCopy("web")).toBe(true);
    expect(showsNoAppCopy("ios")).toBe(false);
    expect(showsNoAppCopy("android")).toBe(false);
  });
});
