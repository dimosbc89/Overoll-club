import { describe, expect, it } from 'vitest';

import faviconSvg from '../../../assets/brand/overoll-favicon.svg?raw';
import logoSvg from '../../../assets/brand/overoll-logo.svg?raw';
import wordmarkSvg from '../../../assets/brand/overoll-wordmark.svg?raw';
import koalaLockupSvg from '../../../assets/brand/koala/koala-lockup-green.svg?raw';
import koalaMarkSvg from '../../../assets/brand/koala/koala-mark-green.svg?raw';
import * as koalaShapes from '../src/brand/koalaPaths';
import * as shapes from '../src/brand/overollPaths';

function svg(text: string) {
  const viewBox = /viewBox="([^"]+)"/.exec(text)![1]!.split(/\s+/).map(Number);
  const paths = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  return { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3], paths };
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

describe('Koala logo shapes', () => {
  it('the mark matches assets/brand/koala/koala-mark-green.svg (even-odd fill)', () => {
    const fromFile = svg(koalaMarkSvg);
    expect(koalaShapes.mark.x).toBe(fromFile.x);
    expect(koalaShapes.mark.y).toBe(fromFile.y);
    expect(koalaShapes.mark.width).toBe(fromFile.width);
    expect(koalaShapes.mark.height).toBe(fromFile.height);
    expect(koalaShapes.mark.paths).toEqual(fromFile.paths);
    expect(koalaShapes.mark.evenOdd).toBe(true);
    expect(koalaMarkSvg).toContain('fill-rule="evenodd"');
  });

  it('the lockup matches assets/brand/koala/koala-lockup-green.svg', () => {
    const fromFile = svg(koalaLockupSvg);
    expect(koalaShapes.wordmark.width).toBe(fromFile.width);
    expect(koalaShapes.wordmark.height).toBe(fromFile.height);
    expect(koalaShapes.wordmark.paths).toEqual(fromFile.paths);
  });
});
