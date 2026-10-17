import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareTestDatabase } from './helpers';

interface LoginResponse {
  accessToken: string;
}

interface AdjustmentResponse {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
  stockAfter: number;
}

let userCounter = 0;

describe('Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminJwt: string;
  let adminId: number;
  let customerJwt: string;
  let productId: number;

  const register = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'customer-pass-123' });

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'customer-pass-123' })
      .expect(200)
      .then((res) => (res.body as LoginResponse).accessToken);

  const makeAdmin = async () => {
    const email = `admin-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });
    adminId = user.id;
    adminJwt = await login(email);
  };

  const makeCustomer = async () => {
    const email = `customer-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    customerJwt = await login(email);
  };

  const makeProduct = (stock: number) =>
    prisma.product.create({
      data: { name: 'Ledger Pen', pricePiasters: 250, stock },
    });

  beforeAll(async () => {
    await prepareTestDatabase();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await makeAdmin();
    await makeCustomer();
    productId = (await makeProduct(5)).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await app.close();
  });

  describe('POST /admin/products/:id/stock', () => {
    it('rejects anonymous and customer requests', async () => {
      const server = app.getHttpServer();
      await request(server)
        .post(`/admin/products/${productId}/stock`)
        .send({ delta: 10 })
        .expect(401);
      await request(server)
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ delta: 10 })
        .expect(403);
    });

    it('applies a positive delta and records the movement', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: 10 })
        .expect(201);

      const body = res.body as AdjustmentResponse;
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'delta',
        'id',
        'note',
        'productId',
        'reason',
        'stockAfter',
      ]);
      expect(body.delta).toBe(10);
      expect(body.reason).toBe('ADJUSTMENT');
      expect(body.stockAfter).toBe(15);

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(product?.stock).toBe(15);

      const movement = await prisma.inventoryMovement.findFirst({
        where: { productId },
      });
      expect(movement).toMatchObject({
        delta: 10,
        reason: 'ADJUSTMENT',
        createdById: adminId,
      });
    });

    it('applies a negative delta within the available stock', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: -3 })
        .expect(201);

      expect((res.body as AdjustmentResponse).stockAfter).toBe(2);
    });

    it('records an explicit note and reason', async () => {
      await request(app.getHttpServer())
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: 4, reason: 'RESTOCK', note: 'Shipment #14' })
        .expect(201);

      const movement = await prisma.inventoryMovement.findFirst({
        where: { productId },
      });
      expect(movement).toMatchObject({
        delta: 4,
        reason: 'RESTOCK',
        note: 'Shipment #14',
      });
    });

    it('refuses a delta that would make the stock negative', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: -6 })
        .expect(409);

      expect((res.body as { message: string }).message).toContain(
        'Insufficient stock',
      );

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(product?.stock).toBe(5);
      expect(
        await prisma.inventoryMovement.count({ where: { productId } }),
      ).toBe(0);
    });

    it('rejects a zero delta with 400', async () => {
      await request(app.getHttpServer())
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: 0 })
        .expect(400);
    });

    it('rejects a non-integer delta with 400', async () => {
      await request(app.getHttpServer())
        .post(`/admin/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: 'many' })
        .expect(400);
    });

    it('returns 404 for a missing product', async () => {
      await request(app.getHttpServer())
        .post('/admin/products/999999/stock')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: 10 })
        .expect(404);
    });

    it('rejects invalid ids with 400', async () => {
      await request(app.getHttpServer())
        .post('/admin/products/abc/stock')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ delta: 10 })
        .expect(400);
    });
  });
});
