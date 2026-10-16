import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListProductsQueryDto,
  ProductSort,
} from './dto/list-products-query.dto';
import { CatalogService } from './catalog.service';

type ProductWhere = {
  status: string;
  categoryId?: number;
  name?: { contains: string; mode: string };
  pricePiasters?: { gte?: number; lte?: number };
};

type FindManyArgs = {
  where: ProductWhere;
  orderBy: { id: string }[];
  skip: number;
  take: number;
};

describe('CatalogService', () => {
  let service: CatalogService;
  let findMany: jest.Mock;
  let count: jest.Mock;
  let capturedFindManyArgs: FindManyArgs[];

  beforeEach(async () => {
    capturedFindManyArgs = [];
    findMany = jest.fn((args: FindManyArgs) => {
      capturedFindManyArgs.push(args);
      return Promise.resolve([] as { id: number; name: string }[]);
    });
    count = jest.fn().mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: { product: { findMany, count } } },
      ],
    }).compile();
    service = module.get(CatalogService);
  });

  const query = (overrides: Partial<ListProductsQueryDto> = {}) =>
    Object.assign(new ListProductsQueryDto(), {
      page: 1,
      limit: 10,
      sort: ProductSort.Newest,
      ...overrides,
    });

  it('queries only active products and maps pagination to prisma', async () => {
    count.mockResolvedValue(25);
    await service.listActiveProducts(query({ page: 2, limit: 5 }));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE' },
        skip: 5,
        take: 5,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });

  it('narrows by category, search, and price range on top of the active filter', async () => {
    await service.listActiveProducts(
      query({
        categoryId: 7,
        search: 'notebook',
        minPrice: 100,
        maxPrice: 900,
      }),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          categoryId: 7,
          name: { contains: 'notebook', mode: 'insensitive' },
          pricePiasters: { gte: 100, lte: 900 },
        },
      }),
    );
  });

  it('keeps one-sided price filters partial', async () => {
    await service.listActiveProducts(query({ minPrice: 250 }));

    const lastArgs = capturedFindManyArgs.at(-1);
    if (!lastArgs) throw new Error('findMany was not called');
    expect(lastArgs.where.pricePiasters).toEqual({ gte: 250 });
  });

  it('returns the items with the exact query values and page math', async () => {
    findMany.mockResolvedValue([{ id: 1, name: 'Alpha' }]);
    count.mockResolvedValue(25);
    const result = await service.listActiveProducts(query({ page: 2 }));

    expect(result.items).toEqual([{ id: 1, name: 'Alpha' }]);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it('reports zero totalPages when there are no products', async () => {
    const result = await service.listActiveProducts(query());

    expect(result.items).toEqual([]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it.each(Object.values(ProductSort))(
    'maps sort "%s" to a stable order with an id tiebreaker',
    async (sort) => {
      await service.listActiveProducts(query({ sort }));

      const lastArgs = capturedFindManyArgs.at(-1);
      if (!lastArgs) throw new Error('findMany was not called');
      expect(lastArgs.orderBy.length).toBeGreaterThan(1);
      expect(['asc', 'desc']).toContain(lastArgs.orderBy.at(-1)?.id);
    },
  );
});
