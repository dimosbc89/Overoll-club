import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// src/ must also run as Supabase Edge Functions (Deno): no Node-only APIs.
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src');
const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
const forbidden: Array<[RegExp, string]> = [
  [/from\s+['"]node:/, 'node: import'],
  [/from\s+['"](fs|path|crypto|os|child_process|net|tls|stream|buffer|util)['"]/, 'Node built-in import'],
  [/\bBuffer\b/, 'Buffer'],
  [/\bprocess\./, 'process'],
  [/\brequire\(/, 'require()'],
  [/__dirname|__filename/, '__dirname/__filename'],
];

describe('runtime portability (Node and Deno)', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });
  it.each(files)('%s uses no Node-only APIs', (file) => {
    const source = readFileSync(join(srcDir, file), 'utf8');
    for (const [pattern, label] of forbidden) {
      expect(pattern.test(source), `${file} uses ${label}`).toBe(false);
    }
  });
});
