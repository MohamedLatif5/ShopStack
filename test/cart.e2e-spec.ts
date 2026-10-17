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

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

interface CartItemResponse {
  id: number;
  productId: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    pricePiasters: number;
    stock: number;
  };
  createdAt: string;
}

let userCounter = 0;

describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let customerJwt: string;
  let customerId: number;
  let alphaId: number;
  let hiddenId: number;

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

  const makeCustomer = async () => {
    const email = `cart-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    customerJwt = await login(email);
    const user = await prisma.user.findUnique({ where: { email } });
    customerId = user?.id ?? 0;
  };

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
    await prisma.cartItem.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await makeCustomer();

    const alpha = await prisma.product.create({
      data: { name: 'Alpha Notebook', pricePiasters: 1500, stock: 5 },
    });
    const hidden = await prisma.product.create({
      data: {
        name: 'Hidden Ink',
        pricePiasters: 100,
        stock: 3,
        status: 'INACTIVE',
      },
    });
    alphaId = alpha.id;
    hiddenId = hidden.id;
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await app.close();
  });

  describe('POST /cart/items', () => {
    it('rejects an anonymous request', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .send({ productId: alphaId, quantity: 1 });
      expect(res.status).toBe(401);
    });

    it('adds the product with live product data', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: alphaId, quantity: 2 });
      expect(res.status).toBe(201);

      const body = res.body as CartItemResponse;
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'id',
        'product',
        'productId',
        'quantity',
      ]);
      expect(body.productId).toBe(alphaId);
      expect(body.quantity).toBe(2);
      expect(body.product).toEqual({
        id: alphaId,
        name: 'Alpha Notebook',
        pricePiasters: 1500,
        stock: 5,
      });

      const stored = await prisma.cartItem.findFirst({
        where: { customerId },
      });
      expect(stored?.quantity).toBe(2);
    });

    it('rejects adding the same product twice', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: alphaId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: alphaId, quantity: 1 });
      expect(res.status).toBe(409);
      expect((res.body as ErrorResponse).message).toBe(
        'Product is already in your cart',
      );
    });

    it('rejects an inactive product as not found', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: hiddenId, quantity: 1 });
      expect(res.status).toBe(404);
    });

    it('rejects a missing product', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: 999999, quantity: 1 });
      expect(res.status).toBe(404);
    });

    it('rejects a zero quantity', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: alphaId, quantity: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects a quantity above current stock', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ productId: alphaId, quantity: 6 });
      expect(res.status).toBe(409);
      expect((res.body as ErrorResponse).message).toBe(
        'Insufficient stock: only 5 left of Alpha Notebook',
      );
    });
  });
});
