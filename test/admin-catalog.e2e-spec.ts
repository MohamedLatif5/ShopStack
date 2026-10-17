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

interface CreatedProduct {
  id: number;
  name: string;
  description: string | null;
  pricePiasters: number;
  stock: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  category: { id: number; name: string } | null;
}

let userCounter = 0;

describe('Admin catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let booksId: number;
  let adminJwt: string;
  let customerJwt: string;

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

  /** A fresh admin per test: register, promote in the DB, log in. */
  const makeAdminToken = async () => {
    const email = `admin-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
    return login(email);
  };

  const makeCustomerToken = async () => {
    const email = `customer-e2e-${++userCounter}@shopstack.dev`;
    await register(email);
    return login(email);
  };

  const createPayload = {
    name: 'Admin Notebook',
    pricePiasters: 1250,
    stock: 5,
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
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    booksId = (await prisma.category.create({ data: { name: 'E2E Books' } }))
      .id;
    adminJwt = await makeAdminToken();
    customerJwt = await makeCustomerToken();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await app.close();
  });

  describe('POST /admin/products', () => {
    it('rejects anonymous requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/admin/products')
        .send(createPayload)
        .expect(401);
    });

    it('rejects customer accounts with 403', async () => {
      await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send(createPayload)
        .expect(403);
    });

    it('creates a product for an admin with defaults', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send(createPayload)
        .expect(201);

      const body = res.body as CreatedProduct;
      expect(Object.keys(body).sort()).toEqual([
        'category',
        'createdAt',
        'description',
        'id',
        'name',
        'pricePiasters',
        'status',
        'stock',
        'updatedAt',
      ]);
      expect(body.name).toBe('Admin Notebook');
      expect(body.pricePiasters).toBe(1250);
      expect(body.stock).toBe(5);
      expect(body.status).toBe('ACTIVE');
      expect(body.description).toBeNull();
      expect(body.category).toBeNull();
      expect(body.id).toBeGreaterThan(0);
    });

    it('links an existing category when categoryId is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ ...createPayload, categoryId: booksId })
        .expect(201);

      expect((res.body as CreatedProduct).category).toEqual({
        id: booksId,
        name: 'E2E Books',
      });
    });

    it('treats an explicit null categoryId as no category', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ ...createPayload, categoryId: null })
        .expect(201);

      expect((res.body as CreatedProduct).category).toBeNull();
    });

    it('creates inactive products that stay hidden from the public catalog', async () => {
      await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ ...createPayload, status: 'INACTIVE' })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/products')
        .expect(200);
      const names = (list.body as { items: { name: string }[] }).items.map(
        (item) => item.name,
      );
      expect(names).toEqual([]);
    });

    it('rejects invalid payloads with 400', async () => {
      await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ ...createPayload, pricePiasters: -5 })
        .expect(400);
    });

    it('rejects a nonexistent category with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ ...createPayload, categoryId: 999999 })
        .expect(400);

      expect((res.body as { message: string }).message).toContain('Category');
    });
  });

  describe('PATCH /admin/products/:id', () => {
    const makeProduct = (data: {
      name: string;
      pricePiasters: number;
      stock?: number;
      categoryId?: number | null;
      status?: 'ACTIVE' | 'INACTIVE';
    }) => prisma.product.create({ data });

    it('rejects anonymous requests with 401', async () => {
      await request(app.getHttpServer())
        .patch('/admin/products/1')
        .send({ name: 'Nope' })
        .expect(401);
    });

    it('rejects customer accounts with 403', async () => {
      await request(app.getHttpServer())
        .patch('/admin/products/1')
        .set('Authorization', `Bearer ${customerJwt}`)
        .send({ name: 'Nope' })
        .expect(403);
    });

    it('updates only the provided fields', async () => {
      const product = await makeProduct({
        name: 'Old Name',
        pricePiasters: 900,
        stock: 2,
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ name: 'New Name', pricePiasters: 1000 })
        .expect(200);

      const body = res.body as CreatedProduct;
      expect(body.name).toBe('New Name');
      expect(body.pricePiasters).toBe(1000);
      expect(body.stock).toBe(2);
      expect(body.status).toBe('ACTIVE');

      const stored = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(stored?.name).toBe('New Name');
      expect(stored?.pricePiasters).toBe(1000);
    });

    it('deactivating hides the product publicly and reactivating restores it', async () => {
      const product = await makeProduct({
        name: 'Flippable',
        pricePiasters: 500,
        stock: 1,
      });

      await request(app.getHttpServer())
        .patch(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get('/products')
        .expect(200)
        .expect((res) => {
          const body = res.body as { items: unknown[] };
          if (body.items.length !== 0) throw new Error('expected no items');
        });

      await request(app.getHttpServer())
        .patch(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
    });

    it('unlinks the category when categoryId is null', async () => {
      const product = await makeProduct({
        name: 'Linked',
        pricePiasters: 100,
        stock: 1,
        categoryId: booksId,
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ categoryId: null })
        .expect(200);

      expect((res.body as CreatedProduct).category).toBeNull();
    });

    it('rejects a nonexistent category with 400', async () => {
      const product = await makeProduct({
        name: 'Victim',
        pricePiasters: 100,
        stock: 1,
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ categoryId: 999999 })
        .expect(400);

      expect((res.body as { message: string }).message).toContain('Category');
    });

    it('returns 404 for a missing product', async () => {
      await request(app.getHttpServer())
        .patch('/admin/products/999999')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('rejects invalid ids with 400', async () => {
      await request(app.getHttpServer())
        .patch('/admin/products/abc')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ name: 'Ghost' })
        .expect(400);
    });

    it('rejects an empty patch with 400', async () => {
      const product = await makeProduct({
        name: 'Untouched',
        pricePiasters: 100,
        stock: 1,
      });

      await request(app.getHttpServer())
        .patch(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /admin/products/:id', () => {
    it('rejects anonymous requests with 401', async () => {
      await request(app.getHttpServer())
        .delete('/admin/products/1')
        .expect(401);
    });

    it('rejects customer accounts with 403', async () => {
      await request(app.getHttpServer())
        .delete('/admin/products/1')
        .set('Authorization', `Bearer ${customerJwt}`)
        .expect(403);
    });

    it('deletes an existing product, which then disappears publicly', async () => {
      const product = await prisma.product.create({
        data: { name: 'Doomed', pricePiasters: 100, stock: 1 },
      });

      await request(app.getHttpServer())
        .delete(`/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(204);

      expect(
        await prisma.product.findUnique({ where: { id: product.id } }),
      ).toBeNull();
      await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(404);
    });

    it('returns 404 for a missing product', async () => {
      await request(app.getHttpServer())
        .delete('/admin/products/999999')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(404);
    });

    it('rejects invalid ids with 400', async () => {
      await request(app.getHttpServer())
        .delete('/admin/products/abc')
        .set('Authorization', `Bearer ${adminJwt}`)
        .expect(400);
    });
  });
});
