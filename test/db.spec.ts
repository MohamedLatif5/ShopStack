import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Loads the project .env (if present) without overriding real environment variables.
// Deliberately tiny: it only needs to handle this project's simple KEY="value" format.
function loadEnvFile(path: string): void {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) {
      process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
    }
  }
}

try {
  loadEnvFile(join(__dirname, '..', '.env'));
} catch {
  // .env is optional; fall back to the process environment (e.g. CI).
}

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    'DATABASE_URL_TEST is not set. Copy .env.example to .env and try again.',
  );
}

const testDbName = new URL(testUrl).pathname.split('/')[1];
const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';

describe('database schema on a fresh test database', () => {
  let client: PrismaClient;

  beforeAll(async () => {
    // Recreate the test database from scratch so every run proves the migration
    // applies cleanly to a fresh database.
    const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`,
    );
    await admin.$executeRawUnsafe(`CREATE DATABASE "${testDbName}"`);
    await admin.$disconnect();

    execSync('npx prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testUrl },
    });

    client = new PrismaClient({ datasourceUrl: testUrl });
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('applies the initial migration to the fresh database', async () => {
    const migrations = await client.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;
    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(migrations[0].migration_name).toContain('init');
  });

  it('rejects a duplicate category name', async () => {
    await client.category.create({ data: { name: 'Unique Books' } });
    await expect(
      client.category.create({ data: { name: 'Unique Books' } }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects a duplicate user email', async () => {
    await client.user.create({
      data: { email: 'duplicate@example.com', passwordHash: 'not-a-real-hash' },
    });
    await expect(
      client.user.create({
        data: {
          email: 'duplicate@example.com',
          passwordHash: 'not-a-real-hash',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a negative price', async () => {
    await expect(
      client.product.create({
        data: { name: 'Negative price', pricePiasters: -1 },
      }),
    ).rejects.toThrow(/check/i);
  });

  it('rejects a negative stock', async () => {
    await expect(
      client.product.create({
        data: { name: 'Negative stock', pricePiasters: 100, stock: -1 },
      }),
    ).rejects.toThrow(/check/i);
  });

  it('allows a zero price and zero stock', async () => {
    const product = await client.product.create({
      data: { name: 'Free out-of-stock item', pricePiasters: 0 },
    });
    expect(product.stock).toBe(0);
  });

  it('blocks deleting a category that still has products', async () => {
    const category = await client.category.create({
      data: { name: 'Occupied category' },
    });
    await client.product.create({
      data: {
        name: 'Item in occupied category',
        pricePiasters: 1000,
        categoryId: category.id,
      },
    });

    await expect(
      client.category.delete({ where: { id: category.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });

    // Removing the linked products first makes the delete succeed.
    await client.product.deleteMany({ where: { categoryId: category.id } });
    await expect(
      client.category.delete({ where: { id: category.id } }),
    ).resolves.toBeDefined();
  });

  it('allows deleting a category with no linked products', async () => {
    const category = await client.category.create({
      data: { name: 'Empty category' },
    });
    await expect(
      client.category.delete({ where: { id: category.id } }),
    ).resolves.toBeDefined();
  });

  it('links and unlinks a product with a category', async () => {
    const category = await client.category.create({
      data: { name: 'Linkable category' },
    });
    const product = await client.product.create({
      data: { name: 'Linkable product', pricePiasters: 500 },
    });
    expect(product.categoryId).toBeNull();

    const linked = await client.product.update({
      where: { id: product.id },
      data: { categoryId: category.id },
    });
    expect(linked.categoryId).toBe(category.id);

    const withCategory = await client.product.findUnique({
      where: { id: product.id },
      include: { category: true },
    });
    expect(withCategory?.category?.name).toBe('Linkable category');

    const unlinked = await client.product.update({
      where: { id: product.id },
      data: { categoryId: null },
    });
    expect(unlinked.categoryId).toBeNull();
  });

  it('applies the approved defaults', async () => {
    const user = await client.user.create({
      data: { email: 'defaults@example.com', passwordHash: 'not-a-real-hash' },
    });
    expect(user.role).toBe('CUSTOMER');

    const category = await client.category.create({
      data: { name: 'Defaults category' },
    });
    expect(category.isActive).toBe(true);

    const product = await client.product.create({
      data: { name: 'Defaults product', pricePiasters: 1000 },
    });
    expect(product.stock).toBe(0);
    expect(product.status).toBe('ACTIVE');
    expect(product.createdAt).toBeInstanceOf(Date);
  });
});
