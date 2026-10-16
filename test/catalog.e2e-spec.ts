import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareTestDatabase } from './helpers';

type CategoryRef = { id: number; name: string } | null;

interface ProductListItem {
  id: number;
  name: string;
  description: string | null;
  pricePiasters: number;
  stock: number;
  createdAt: string;
  category: CategoryRef;
}

interface ListResponse {
  items: ProductListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let booksId: number;

  const makeProduct = (data: {
    name: string;
    pricePiasters: number;
    status?: 'ACTIVE' | 'INACTIVE';
    categoryId?: number | null;
  }) => prisma.product.create({ data });

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
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});

    const books = await prisma.category.create({
      data: { name: 'E2E Books' },
    });
    const games = await prisma.category.create({
      data: { name: 'E2E Games' },
    });
    booksId = books.id;

    await makeProduct({
      name: 'Alpha Notebook',
      pricePiasters: 1500,
      categoryId: books.id,
    });
    await makeProduct({
      name: 'Beta Notebook',
      pricePiasters: 500,
      categoryId: games.id,
    });
    await makeProduct({ name: 'Gamma Sticker Pack', pricePiasters: 2000 });
    await makeProduct({
      name: 'Hidden Ink',
      pricePiasters: 100,
      status: 'INACTIVE',
      categoryId: books.id,
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await app.close();
  });

  it('lists only active products with pagination meta', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    const body = res.body as ListResponse;

    const names = body.items.map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Alpha Notebook',
        'Beta Notebook',
        'Gamma Sticker Pack',
      ]),
    );
    expect(body.items).toHaveLength(3);
    expect(body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 3,
      totalPages: 1,
    });
  });

  it('exposes only the approved product fields', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    const body = res.body as ListResponse;

    expect(Object.keys(body.items[0]).sort()).toEqual([
      'category',
      'createdAt',
      'description',
      'id',
      'name',
      'pricePiasters',
      'stock',
    ]);
  });

  it('paginates with page and limit', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?page=2&limit=2')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items).toHaveLength(1);
    expect(body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('returns an empty items array for a page beyond the range', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?page=50')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items).toEqual([]);
    expect(body.meta).toEqual({
      page: 50,
      limit: 10,
      total: 3,
      totalPages: 1,
    });
  });

  it('sorts by price ascending', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?sort=price_asc')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items.map((item) => item.name)).toEqual([
      'Beta Notebook',
      'Alpha Notebook',
      'Gamma Sticker Pack',
    ]);
  });

  it('sorts by name descending', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?sort=name_desc')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items.map((item) => item.name)).toEqual([
      'Gamma Sticker Pack',
      'Beta Notebook',
      'Alpha Notebook',
    ]);
  });

  it('filters by category', async () => {
    const res = await request(app.getHttpServer())
      .get(`/products?categoryId=${booksId}`)
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items.map((item) => item.name)).toEqual(['Alpha Notebook']);
    expect(body.meta.total).toBe(1);
  });

  it('searches by name case-insensitively', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?search=NOTEBOOK')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items.map((item) => item.name).sort()).toEqual([
      'Alpha Notebook',
      'Beta Notebook',
    ]);
    expect(body.meta.total).toBe(2);
  });

  it('never returns inactive products even when the search matches them', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?search=ink')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('filters by an exact price range', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?minPrice=600&maxPrice=1600')
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items.map((item) => item.name)).toEqual(['Alpha Notebook']);
  });

  it('supports one-sided price filters', async () => {
    const cheap = await request(app.getHttpServer())
      .get('/products?maxPrice=1000')
      .expect(200);
    expect((cheap.body as ListResponse).items.map((item) => item.name)).toEqual(
      ['Beta Notebook'],
    );

    const pricey = await request(app.getHttpServer())
      .get('/products?minPrice=1600')
      .expect(200);
    expect(
      (pricey.body as ListResponse).items.map((item) => item.name),
    ).toEqual(['Gamma Sticker Pack']);
  });

  it('combines category, search, and sorting filters', async () => {
    const res = await request(app.getHttpServer())
      .get(`/products?categoryId=${booksId}&search=notebook&sort=name_desc`)
      .expect(200);
    const body = res.body as ListResponse;

    expect(body.items.map((item) => item.name)).toEqual(['Alpha Notebook']);
  });

  it.each([
    'page=0',
    'page=abc',
    'limit=101',
    'limit=oops',
    'sort=foo',
    'flavor=sweet',
    'categoryId=abc',
    'categoryId=0',
    'minPrice=-1',
    'minPrice=1000&maxPrice=500',
  ])('rejects invalid query %s', async (queryString) => {
    const res = await request(app.getHttpServer())
      .get(`/products?${queryString}`)
      .expect(400);
    const body = res.body as { error: string };

    expect(body.error).toBe('Bad Request');
  });
});
