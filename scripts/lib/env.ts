import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load .env from the repo root. Values are never printed anywhere
 * (CLAUDE.md: secrets never appear in output or logs).
 */
export function loadEnv(): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing ${key} — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}
