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

interface OrderListResponse {
  items: OrderResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface OrderItemResponse {
  id: number;
  productId: number | null;
  productName: string;
  unitPricePiasters: number;
  quantity: number;
}

interface OrderResponse {
  id: number;
  status: string;
  totalPiasters: number;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  createdAt: string;
  items: OrderItemResponse[];
}

const shippingAddress = {
  fullName: 'Sara Ali',
  phone: '01000000000',
  address: '12 Talaat Harb St., Downtown, Cairo',
};

let userCounter = 0;

describe('Customer order history (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let customerJwt: string;
  let customerId: number;
  let productId: number;
  let firstOrderId: number;
  let secondOrderId: number;

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
    const email = `history-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    const jwt = await login(email);
    const user = await prisma.user.findUnique({ where: { email } });
    return { jwt, id: user?.id ?? 0, email };
  };

  const makeAdmin = async () => {
    const email = `admin-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
    return login(email);
  };

  const addToCart = (jwt: string, quantity: number) =>
    request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ productId, quantity });

  const checkout = (jwt: string) =>
    request(app.getHttpServer())
      .post('/checkout')
      .set('Authorization', `Bearer ${jwt}`)
      .send(shippingAddress);

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
    await prisma.inventoryMovement.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});

    const customer = await makeCustomer();
    customerJwt = customer.jwt;
    customerId = customer.id;

    const product = await prisma.product.create({
      data: { name: 'History Notebook', pricePiasters: 1500, stock: 50 },
    });
    productId = product.id;

    await addToCart(customerJwt, 1).expect(201);
    const first = await checkout(customerJwt).expect(201);
    firstOrderId = (first.body as OrderResponse).id;

    await addToCart(customerJwt, 2).expect(201);
    const second = await checkout(customerJwt).expect(201);
    secondOrderId = (second.body as OrderResponse).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /orders', () => {
    it('rejects an anonymous request', () =>
      request(app.getHttpServer())
        .get('/orders')
        .expect(401)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.error).toBe('Unauthorized');
        }));

    it('lists only the customer orders, newest first', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(200);

      const body = res.body as OrderListResponse;
      expect(body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(body.items.map((order) => order.id)).toEqual([
        secondOrderId,
        firstOrderId,
      ]);
      expect(body.items[0]?.status).toBe('PENDING');
      expect(body.items[0]?.items).toHaveLength(1);
      expect(body.items[0]?.items[0]?.productName).toBe('History Notebook');
    });

    it('paginates with page and limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders?page=1&limit=1')
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(200);

      const body = res.body as OrderListResponse;
      expect(body.items.map((order) => order.id)).toEqual([secondOrderId]);
      expect(body.meta).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('returns an empty list for a customer without orders', async () => {
      const other = await makeCustomer();
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${other.jwt}`)
        .expect(200);

      const body = res.body as OrderListResponse;
      expect(body.items).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it.each(['?page=0', '?limit=101', '?page=abc'])(
      'rejects invalid pagination %s',
      async (query) => {
        await request(app.getHttpServer())
          .get(`/orders${query}`)
          .set('Authorization', `Bearer ${customerJwt}`)
          .expect(400);
      },
    );
  });

  describe('GET /orders/:id', () => {
    it('rejects an anonymous request', () =>
      request(app.getHttpServer()).get(`/orders/${firstOrderId}`).expect(401));

    it('returns the customer own order with its snapshot items', async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${firstOrderId}`)
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(200);

      const order = res.body as OrderResponse;
      expect(Object.keys(order).sort()).toEqual([
        'createdAt',
        'id',
        'items',
        'shippingAddress',
        'shippingName',
        'shippingPhone',
        'status',
        'totalPiasters',
      ]);
      expect(order.id).toBe(firstOrderId);
      expect(order.totalPiasters).toBe(1500);
      expect(order.items[0]).toMatchObject({
        productId,
        productName: 'History Notebook',
        unitPricePiasters: 1500,
        quantity: 1,
      });
    });

    it("hides another customer's order behind 404", async () => {
      const other = await makeCustomer();
      await request(app.getHttpServer())
        .get(`/orders/${firstOrderId}`)
        .set('Authorization', `Bearer ${other.jwt}`)
        .expect(404)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.error).toBe('Not Found');
        });
    });

    it('returns 404 for a missing order', async () => {
      await request(app.getHttpServer())
        .get('/orders/999999')
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(404);
    });

    it.each(['abc', '0', '-3'])('rejects invalid id %s', async (id) => {
      await request(app.getHttpServer())
        .get(`/orders/${id}`)
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(400);
    });
  });

  describe('admin order views', () => {
    it('rejects anonymous and non-admin requests', async () => {
      const adminJwt = await makeAdmin();
      await request(app.getHttpServer()).get('/admin/orders').expect(401);
      await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/admin/orders/${firstOrderId}`)
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(200);
    });

    it('lists every order newest first with the owning customer', async () => {
      const adminJwt = await makeAdmin();
      const other = await makeCustomer();
      await addToCart(other.jwt, 3).expect(201);
      const third = await checkout(other.jwt).expect(201);
      const thirdOrderId = (third.body as OrderResponse).id;

      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(200);

      const body = res.body as OrderListResponse & {
        items: Array<
          OrderResponse & {
            customer: { id: number; email: string; fullName: string | null };
          }
        >;
      };
      expect(body.meta.total).toBe(3);
      expect(body.items.map((order) => order.id)).toEqual([
        thirdOrderId,
        secondOrderId,
        firstOrderId,
      ]);
      expect(body.items[0]?.customer).toMatchObject({
        id: other.id,
        email: other.email,
      });
      expect(body.items[1]?.customer.id).toBe(customerId);
    });

    it('filters by status', async () => {
      const adminJwt = await makeAdmin();

      const res = await request(app.getHttpServer())
        .get('/admin/orders?status=PENDING')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(200);
      expect((res.body as OrderListResponse).meta.total).toBe(2);

      const res2 = await request(app.getHttpServer())
        .get('/admin/orders?status=DELIVERED')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(200);
      expect((res2.body as OrderListResponse).meta.total).toBe(0);
    });

    it('rejects an invalid status filter', async () => {
      const adminJwt = await makeAdmin();
      await request(app.getHttpServer())
        .get('/admin/orders?status=BOGUS')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(400);
    });

    it('returns any single order with its customer', async () => {
      const adminJwt = await makeAdmin();
      const res = await request(app.getHttpServer())
        .get(`/admin/orders/${secondOrderId}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(200);

      const order = res.body as OrderResponse & {
        customer: { id: number; email: string };
      };
      expect(order.id).toBe(secondOrderId);
      expect(order.customer.id).toBe(customerId);
      expect(order.customer.email).toContain('history-e2e-');
    });

    it('returns 404 for a missing order and 400 for a bad id', async () => {
      const adminJwt = await makeAdmin();
      await request(app.getHttpServer())
        .get('/admin/orders/999999')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(404);
      await request(app.getHttpServer())
        .get('/admin/orders/abc')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(400);
    });
  });

  describe('admin order status updates', () => {
    const patchStatus = (
      jwt: string,
      orderId: number | string,
      status: string,
    ) =>
      request(app.getHttpServer())
        .patch(`/admin/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ status });

    it('rejects anonymous and non-admin requests', async () => {
      const adminJwt = await makeAdmin();
      await patchStatus('no-token', firstOrderId, 'CONFIRMED').expect(401);
      await patchStatus(customerJwt, firstOrderId, 'CONFIRMED').expect(403);
      await patchStatus(adminJwt, firstOrderId, 'CONFIRMED').expect(200);
    });

    it('moves an order along the approved chain without touching stock', async () => {
      const adminJwt = await makeAdmin();
      const res = await patchStatus(
        adminJwt,
        secondOrderId,
        'CONFIRMED',
      ).expect(200);
      expect((res.body as OrderResponse).status).toBe('CONFIRMED');
      await patchStatus(adminJwt, secondOrderId, 'PROCESSING').expect(200);
      await patchStatus(adminJwt, secondOrderId, 'SHIPPED').expect(200);
      const res4 = await patchStatus(
        adminJwt,
        secondOrderId,
        'DELIVERED',
      ).expect(200);
      expect((res4.body as OrderResponse).status).toBe('DELIVERED');

      const order = await prisma.order.findUnique({
        where: { id: secondOrderId },
      });
      expect(order?.status).toBe('DELIVERED');
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(product?.stock).toBe(47);
    });

    it('rejects a transition outside the matrix', async () => {
      const adminJwt = await makeAdmin();
      const res = await patchStatus(adminJwt, firstOrderId, 'DELIVERED').expect(
        409,
      );
      expect((res.body as ErrorResponse).error).toBe('Conflict');

      const order = await prisma.order.findUnique({
        where: { id: firstOrderId },
      });
      expect(order?.status).toBe('PENDING');
    });

    it('cancelling restocks the deducted items exactly once', async () => {
      const adminJwt = await makeAdmin();
      const res = await patchStatus(adminJwt, firstOrderId, 'CANCELLED').expect(
        200,
      );
      expect((res.body as OrderResponse).status).toBe('CANCELLED');

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(product?.stock).toBe(48);
      const movements = await prisma.inventoryMovement.findMany({
        where: { note: `Order #${firstOrderId}`, reason: 'CANCELLATION' },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        productId,
        delta: 1,
        reason: 'CANCELLATION',
      });

      // CANCELLED is terminal: a second cancel attempt restores nothing.
      await patchStatus(adminJwt, firstOrderId, 'CANCELLED').expect(409);
      const productAfter = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(productAfter?.stock).toBe(48);
      const movementsAfter = await prisma.inventoryMovement.findMany({
        where: { note: `Order #${firstOrderId}`, reason: 'CANCELLATION' },
      });
      expect(movementsAfter).toHaveLength(1);
    });

    it('returns 404 for a missing order and 400 for bad input', async () => {
      const adminJwt = await makeAdmin();
      await patchStatus(adminJwt, 999999, 'CONFIRMED').expect(404);
      await patchStatus(adminJwt, 'abc', 'CONFIRMED').expect(400);
      await patchStatus(adminJwt, firstOrderId, 'BOGUS').expect(400);
    });
  });
});
