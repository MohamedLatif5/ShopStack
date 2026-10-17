import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { requireTestDatabaseUrl } from './helpers';

const testUrl = requireTestDatabaseUrl();

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

  it('records stock movements with their defaults', async () => {
    const product = await client.product.create({
      data: { name: 'Ledger product', pricePiasters: 700 },
    });

    const movement = await client.inventoryMovement.create({
      data: { productId: product.id, delta: 10 },
    });
    expect(movement.reason).toBe('ADJUSTMENT');
    expect(movement.note).toBeNull();
    expect(movement.createdById).toBeNull();
    expect(movement.createdAt).toBeInstanceOf(Date);

    const negative = await client.inventoryMovement.create({
      data: { productId: product.id, delta: -3, reason: 'SALE' },
    });
    expect(negative.delta).toBe(-3);
  });

  it('rejects a zero-delta stock movement', async () => {
    const product = await client.product.create({
      data: { name: 'Zero delta product', pricePiasters: 300 },
    });
    await expect(
      client.inventoryMovement.create({
        data: { productId: product.id, delta: 0 },
      }),
    ).rejects.toThrow(/check/i);
  });

  it('cascades movement deletion with the product', async () => {
    const product = await client.product.create({
      data: { name: 'Cascade product', pricePiasters: 250 },
    });
    await client.inventoryMovement.create({
      data: { productId: product.id, delta: 5 },
    });

    await client.product.delete({ where: { id: product.id } });
    const remaining = await client.inventoryMovement.findMany({
      where: { productId: product.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('keeps movements but nulls the actor when a user is deleted', async () => {
    const user = await client.user.create({
      data: { email: 'actor@example.com', passwordHash: 'not-a-real-hash' },
    });
    const product = await client.product.create({
      data: { name: 'Actor product', pricePiasters: 400 },
    });
    const movement = await client.inventoryMovement.create({
      data: { productId: product.id, delta: 7, createdById: user.id },
    });
    expect(movement.createdById).toBe(user.id);

    await client.user.delete({ where: { id: user.id } });
    const orphaned = await client.inventoryMovement.findUnique({
      where: { id: movement.id },
    });
    expect(orphaned).not.toBeNull();
    expect(orphaned?.createdById).toBeNull();
  });

  it('stores a cart item with defaults', async () => {
    const user = await client.user.create({
      data: {
        email: 'cart-owner@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const product = await client.product.create({
      data: { name: 'Cart product', pricePiasters: 300, stock: 5 },
    });

    const item = await client.cartItem.create({
      data: { customerId: user.id, productId: product.id, quantity: 2 },
    });
    expect(item.quantity).toBe(2);
    expect(item.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a zero cart quantity', async () => {
    const user = await client.user.create({
      data: { email: 'cart-zero@example.com', passwordHash: 'not-a-real-hash' },
    });
    const product = await client.product.create({
      data: { name: 'Zero product', pricePiasters: 300 },
    });

    await expect(
      client.cartItem.create({
        data: { customerId: user.id, productId: product.id, quantity: 0 },
      }),
    ).rejects.toThrow(/check/i);
  });

  it('rejects the same product twice in one cart', async () => {
    const user = await client.user.create({
      data: { email: 'cart-dup@example.com', passwordHash: 'not-a-real-hash' },
    });
    const product = await client.product.create({
      data: { name: 'Dup product', pricePiasters: 300 },
    });

    await client.cartItem.create({
      data: { customerId: user.id, productId: product.id, quantity: 1 },
    });
    await expect(
      client.cartItem.create({
        data: { customerId: user.id, productId: product.id, quantity: 1 },
      }),
    ).rejects.toThrow(/unique/i);
  });

  it('allows the same product in different carts', async () => {
    const userA = await client.user.create({
      data: { email: 'cart-a@example.com', passwordHash: 'not-a-real-hash' },
    });
    const userB = await client.user.create({
      data: { email: 'cart-b@example.com', passwordHash: 'not-a-real-hash' },
    });
    const product = await client.product.create({
      data: { name: 'Shared product', pricePiasters: 300 },
    });

    await client.cartItem.create({
      data: { customerId: userA.id, productId: product.id, quantity: 1 },
    });
    await client.cartItem.create({
      data: { customerId: userB.id, productId: product.id, quantity: 3 },
    });
    expect(
      await client.cartItem.count({
        where: { customerId: { in: [userA.id, userB.id] } },
      }),
    ).toBe(2);
  });

  it('cascades cart item deletion with the product and the user', async () => {
    const user = await client.user.create({
      data: {
        email: 'cart-cascade@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const product = await client.product.create({
      data: { name: 'Cascade cart product', pricePiasters: 300 },
    });
    const item = await client.cartItem.create({
      data: { customerId: user.id, productId: product.id, quantity: 1 },
    });

    await client.product.delete({ where: { id: product.id } });
    expect(
      await client.cartItem.findUnique({ where: { id: item.id } }),
    ).toBeNull();

    const user2 = await client.user.create({
      data: {
        email: 'cart-cascade-2@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const product2 = await client.product.create({
      data: { name: 'Cascade cart product 2', pricePiasters: 300 },
    });
    const item2 = await client.cartItem.create({
      data: { customerId: user2.id, productId: product2.id, quantity: 1 },
    });
    await client.user.delete({ where: { id: user2.id } });
    expect(
      await client.cartItem.findUnique({ where: { id: item2.id } }),
    ).toBeNull();
  });

  it('stores an order with defaults and nested items', async () => {
    const user = await client.user.create({
      data: {
        email: 'order-owner@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const product = await client.product.create({
      data: { name: 'Ordered Notebook', pricePiasters: 1500, stock: 10 },
    });

    const order = await client.order.create({
      data: {
        customerId: user.id,
        totalPiasters: 3000,
        shippingName: 'Sara Ali',
        shippingPhone: '01000000000',
        shippingAddress: 'Cairo, Egypt',
        items: {
          create: [
            {
              productId: product.id,
              productName: 'Ordered Notebook',
              unitPricePiasters: 1500,
              quantity: 2,
            },
          ],
        },
      },
      include: { items: true },
    });
    expect(order.status).toBe('PENDING');
    expect(order.createdAt).toBeInstanceOf(Date);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.productName).toBe('Ordered Notebook');
  });

  it('rejects a negative order total, negative unit price, and zero quantity', async () => {
    const user = await client.user.create({
      data: {
        email: 'order-checks@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const base = {
      shippingName: 'Sara Ali',
      shippingPhone: '01000000000',
      shippingAddress: 'Cairo, Egypt',
    };

    await expect(
      client.order.create({
        data: { ...base, customerId: user.id, totalPiasters: -1 },
      }),
    ).rejects.toThrow(/check/i);

    const order = await client.order.create({
      data: { ...base, customerId: user.id, totalPiasters: 0 },
    });
    await expect(
      client.orderItem.create({
        data: {
          orderId: order.id,
          productName: 'Bad item',
          unitPricePiasters: -5,
          quantity: 1,
        },
      }),
    ).rejects.toThrow(/check/i);
    await expect(
      client.orderItem.create({
        data: {
          orderId: order.id,
          productName: 'Bad item',
          unitPricePiasters: 100,
          quantity: 0,
        },
      }),
    ).rejects.toThrow(/check/i);
  });

  it('cascades order deletion with its items and the user', async () => {
    const user = await client.user.create({
      data: {
        email: 'order-cascade@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const product = await client.product.create({
      data: { name: 'Cascade order product', pricePiasters: 500, stock: 5 },
    });
    const order = await client.order.create({
      data: {
        customerId: user.id,
        totalPiasters: 500,
        shippingName: 'Sara Ali',
        shippingPhone: '01000000000',
        shippingAddress: 'Cairo, Egypt',
        items: {
          create: {
            productId: product.id,
            productName: 'Cascade order product',
            unitPricePiasters: 500,
            quantity: 1,
          },
        },
      },
    });

    await client.order.delete({ where: { id: order.id } });
    expect(await client.orderItem.count({ where: { orderId: order.id } })).toBe(
      0,
    );

    const order2 = await client.order.create({
      data: {
        customerId: user.id,
        totalPiasters: 500,
        shippingName: 'Sara Ali',
        shippingPhone: '01000000000',
        shippingAddress: 'Cairo, Egypt',
        items: {
          create: {
            productId: product.id,
            productName: 'Cascade order product',
            unitPricePiasters: 500,
            quantity: 1,
          },
        },
      },
    });
    await client.user.delete({ where: { id: user.id } });
    expect(
      await client.order.findUnique({ where: { id: order2.id } }),
    ).toBeNull();
  });

  it('keeps the order item snapshot when its product is deleted', async () => {
    const user = await client.user.create({
      data: {
        email: 'order-snapshot@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    const product = await client.product.create({
      data: { name: 'Snapshot Pen', pricePiasters: 250, stock: 5 },
    });
    const order = await client.order.create({
      data: {
        customerId: user.id,
        totalPiasters: 250,
        shippingName: 'Sara Ali',
        shippingPhone: '01000000000',
        shippingAddress: 'Cairo, Egypt',
        items: {
          create: {
            productId: product.id,
            productName: 'Snapshot Pen',
            unitPricePiasters: 250,
            quantity: 1,
          },
        },
      },
      include: { items: true },
    });
    const itemId = order.items[0]?.id ?? 0;

    await client.product.delete({ where: { id: product.id } });
    const orphaned = await client.orderItem.findUnique({
      where: { id: itemId },
    });
    expect(orphaned).not.toBeNull();
    expect(orphaned?.productId).toBeNull();
    expect(orphaned?.productName).toBe('Snapshot Pen');
    expect(orphaned?.unitPricePiasters).toBe(250);
  });
});
