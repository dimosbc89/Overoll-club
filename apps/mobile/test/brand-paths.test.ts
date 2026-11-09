import { describe, expect, it } from 'vitest';

import faviconSvg from '../../../assets/brand/overoll-favicon.svg?raw';
import logoSvg from '../../../assets/brand/overoll-logo.svg?raw';
import wordmarkSvg from '../../../assets/brand/overoll-wordmark.svg?raw';
import * as shapes from '../src/components/brandPaths';

function svg(text: string) {
  const viewBox = /viewBox="([^"]+)"/.exec(text)![1]!.split(/\s+/).map(Number);
  const paths = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  return { width: viewBox[2], height: viewBox[3], paths };
}

describe('logo shapes', () => {
  it.each([
    ['logo', logoSvg],
    ['wordmark', wordmarkSvg],
    ['mark', faviconSvg],
  ] as const)('%s matches its file in assets/brand', (name, text) => {
    const fromFile = svg(text);
    expect(shapes[name].width).toBe(fromFile.width);
    expect(shapes[name].height).toBe(fromFile.height);
    expect(shapes[name].paths).toEqual(fromFile.paths);
  });
});
