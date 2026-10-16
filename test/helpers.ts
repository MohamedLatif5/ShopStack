import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Minimal .env loader (no dotenv dependency): fills process.env
 * without overriding variables that are already set.
 */
function loadDotEnv(): void {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

/** The test suites must always run against the test database, never the dev one. */
export function requireTestDatabaseUrl(): string {
  loadDotEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Copy .env.example to .env first.',
    );
  }
  return url;
}

/** Creates the test database if needed, applies migrations, and points the app at it. */
export async function prepareTestDatabase(): Promise<string> {
  const url = requireTestDatabaseUrl();
  const dbName = new URL(url).pathname.replace('/', '');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  const [existing] = await admin.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM pg_database WHERE datname = ${dbName}`;
  if (!existing || Number(existing.count) === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  }
  await admin.$disconnect();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
  });

  // The application under test must never touch the dev database.
  process.env.DATABASE_URL = url;
  return url;
}
