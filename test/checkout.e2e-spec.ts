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

describe('Checkout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let customerJwt: string;
  let customerId: number;
  let alphaId: number;
  let betaId: number;

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
    const email = `checkout-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    const jwt = await login(email);
    const user = await prisma.user.findUnique({ where: { email } });
    return { jwt, id: user?.id ?? 0 };
  };

  const addToCart = (jwt: string, productId: number, quantity: number) =>
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

    const alpha = await prisma.product.create({
      data: { name: 'Alpha Notebook', pricePiasters: 1500, stock: 5 },
    });
    const beta = await prisma.product.create({
      data: { name: 'Beta Pen', pricePiasters: 300, stock: 1 },
    });
    alphaId = alpha.id;
    betaId = beta.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an anonymous checkout', () =>
    request(app.getHttpServer())
      .post('/checkout')
      .send(shippingAddress)
      .expect(401)
      .expect((res) => {
        const body = res.body as ErrorResponse;
        expect(body.error).toBe('Unauthorized');
      }));

  it('rejects an empty cart', async () => {
    const res = await checkout(customerJwt).expect(400);
    const body = res.body as ErrorResponse;
    expect(body.message).toBe('Cart is empty');
  });

  it('creates an order from the cart with server-side totals and snapshots', async () => {
    await addToCart(customerJwt, alphaId, 2).expect(201);
    await addToCart(customerJwt, betaId, 1).expect(201);

    const res = await checkout(customerJwt).expect(201);
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
    expect(order.status).toBe('PENDING');
    expect(order.totalPiasters).toBe(3300);
    expect(order.shippingName).toBe('Sara Ali');
    expect(order.items).toHaveLength(2);
    expect(order.items.map((item) => item.productName)).toEqual([
      'Alpha Notebook',
      'Beta Pen',
    ]);
    expect(order.items[0]).toMatchObject({
      productId: alphaId,
      unitPricePiasters: 1500,
      quantity: 2,
    });

    const alphaAfter = await prisma.product.findUnique({
      where: { id: alphaId },
    });
    const betaAfter = await prisma.product.findUnique({
      where: { id: betaId },
    });
    expect(alphaAfter?.stock).toBe(3);
    expect(betaAfter?.stock).toBe(0);

    const movements = await prisma.inventoryMovement.findMany({
      orderBy: { productId: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      productId: alphaId,
      delta: -2,
      reason: 'SALE',
      note: `Order #${order.id}`,
      createdById: customerId,
    });
    expect(movements[1]).toMatchObject({
      productId: betaId,
      delta: -1,
      reason: 'SALE',
    });

    const cart = await prisma.cartItem.count({ where: { customerId } });
    expect(cart).toBe(0);

    const res2 = await checkout(customerJwt).expect(400);
    expect((res2.body as ErrorResponse).message).toBe('Cart is empty');
  });

  it('rejects the whole checkout when a cart product became inactive', async () => {
    await addToCart(customerJwt, alphaId, 1).expect(201);
    await addToCart(customerJwt, betaId, 1).expect(201);
    await prisma.product.update({
      where: { id: alphaId },
      data: { status: 'INACTIVE' },
    });

    const res = await checkout(customerJwt).expect(409);
    const body = res.body as ErrorResponse;
    expect(body.message).toBe('Product Alpha Notebook is no longer available');

    const alphaAfter = await prisma.product.findUnique({
      where: { id: alphaId },
    });
    const betaAfter = await prisma.product.findUnique({
      where: { id: betaId },
    });
    expect(alphaAfter?.stock).toBe(5);
    expect(betaAfter?.stock).toBe(1);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.cartItem.count({ where: { customerId } })).toBe(2);
  });

  it('rejects the whole checkout when stock ran out and changes nothing', async () => {
    await addToCart(customerJwt, betaId, 1).expect(201);
    await prisma.product.update({ where: { id: betaId }, data: { stock: 0 } });

    const res = await checkout(customerJwt).expect(409);
    const body = res.body as ErrorResponse;
    expect(body.message).toBe('Insufficient stock: only 0 left of Beta Pen');

    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.cartItem.count({ where: { customerId } })).toBe(1);
  });

  it('lets only one of two concurrent checkouts buy the last unit', async () => {
    const one = await makeCustomer();
    const two = await makeCustomer();

    await addToCart(one.jwt, betaId, 1).expect(201);
    await addToCart(two.jwt, betaId, 1).expect(201);

    const [resOne, resTwo] = await Promise.all([
      checkout(one.jwt),
      checkout(two.jwt),
    ]);
    const statuses = [resOne.status, resTwo.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const betaAfter = await prisma.product.findUnique({
      where: { id: betaId },
    });
    expect(betaAfter?.stock).toBe(0);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it.each([
    { fullName: '', phone: '01000000000', address: '12 Talaat Harb St.' },
    { fullName: 'Sara Ali', phone: '123', address: '12 Talaat Harb St.' },
    { fullName: 'Sara Ali', phone: '01000000000', address: 'abc' },
    { fullName: 'Sara Ali', phone: '01000000000' },
  ])('rejects invalid shipping details %#', async (payload) => {
    await addToCart(customerJwt, alphaId, 1).expect(201);
    await request(app.getHttpServer())
      .post('/checkout')
      .set('Authorization', `Bearer ${customerJwt}`)
      .send(payload)
      .expect(400);
    expect(await prisma.order.count()).toBe(0);
  });
});
