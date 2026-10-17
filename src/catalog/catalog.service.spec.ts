import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

type FindFirstArgs = {
  where: { id: number; status: string };
};

type CreateArgs = {
  data: {
    name: string;
    description: string | null;
    pricePiasters: number;
    stock: number;
    status: string;
    categoryId: number | null;
  };
};

type UpdateArgs = {
  where: { id: number };
  data: Record<string, unknown>;
};

describe('CatalogService', () => {
  let service: CatalogService;
  let findMany: jest.Mock;
  let count: jest.Mock;
  let findFirst: jest.Mock;
  let capturedFindManyArgs: FindManyArgs[];
  let capturedFindFirstArgs: FindFirstArgs[];
  let findFirstResult: { id: number; name: string; category: null } | null;
  let create: jest.Mock;
  let capturedCreateArgs: CreateArgs[];
  let update: jest.Mock;
  let capturedUpdateArgs: UpdateArgs[];
  let remove: jest.Mock;

  beforeEach(async () => {
    capturedFindManyArgs = [];
    findMany = jest.fn((args: FindManyArgs) => {
      capturedFindManyArgs.push(args);
      return Promise.resolve([] as { id: number; name: string }[]);
    });
    count = jest.fn().mockResolvedValue(0);
    capturedFindFirstArgs = [];
    findFirstResult = null;
    findFirst = jest.fn((args: FindFirstArgs) => {
      capturedFindFirstArgs.push(args);
      return Promise.resolve(findFirstResult);
    });
    capturedCreateArgs = [];
    create = jest.fn((args: CreateArgs) => {
      capturedCreateArgs.push(args);
      return Promise.resolve({ id: 1, name: 'Alpha Notebook' });
    });
    capturedUpdateArgs = [];
    update = jest.fn((args: UpdateArgs) => {
      capturedUpdateArgs.push(args);
      return Promise.resolve({ id: 9, name: 'Alpha Notebook' });
    });
    remove = jest.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: PrismaService,
          useValue: {
            product: {
              findMany,
              count,
              findFirst,
              create,
              update,
              delete: remove,
            },
          },
        },
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

  describe('getActiveProduct', () => {
    const sample: { id: number; name: string; category: null } = {
      id: 9,
      name: 'Alpha Notebook',
      category: null,
    };

    it('returns the product when an active one exists', async () => {
      findFirstResult = sample;

      await expect(service.getActiveProduct(9)).resolves.toEqual(sample);
      expect(capturedFindFirstArgs.at(-1)?.where).toEqual({
        id: 9,
        status: 'ACTIVE',
      });
    });

    it('throws NotFoundException when the product is missing or inactive', async () => {
      await expect(service.getActiveProduct(9)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createProduct', () => {
    it('creates with defaults: ACTIVE status and no category', async () => {
      await service.createProduct({
        name: 'Alpha Notebook',
        pricePiasters: 1500,
        stock: 12,
      });

      expect(capturedCreateArgs.at(-1)?.data).toEqual({
        name: 'Alpha Notebook',
        description: null,
        pricePiasters: 1500,
        stock: 12,
        status: 'ACTIVE',
        categoryId: null,
      });
    });

    it('passes explicit description, status, and category through', async () => {
      await service.createProduct({
        name: 'Hidden Ink',
        description: 'Dark ink',
        pricePiasters: 100,
        stock: 3,
        status: 'INACTIVE',
        categoryId: 7,
      });

      expect(capturedCreateArgs.at(-1)?.data).toEqual({
        name: 'Hidden Ink',
        description: 'Dark ink',
        pricePiasters: 100,
        stock: 3,
        status: 'INACTIVE',
        categoryId: 7,
      });
    });

    it('rejects a nonexistent category as 400, not a 500', async () => {
      create.mockImplementation(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'Foreign key constraint failed on the field: `categoryId`',
            { code: 'P2003', clientVersion: '6.19.3' },
          ),
        ),
      );

      await expect(
        service.createProduct({
          name: 'Orphan Product',
          pricePiasters: 500,
          stock: 1,
          categoryId: 999,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateProduct', () => {
    it('sends only the provided fields to prisma', async () => {
      await service.updateProduct(9, { name: 'New Name', stock: 3 });

      expect(capturedUpdateArgs.at(-1)?.where).toEqual({ id: 9 });
      expect(capturedUpdateArgs.at(-1)?.data).toEqual({
        name: 'New Name',
        stock: 3,
      });
    });

    it('treats explicit nulls as real values', async () => {
      await service.updateProduct(9, {
        description: null,
        categoryId: null,
      });

      expect(capturedUpdateArgs.at(-1)?.data).toEqual({
        description: null,
        categoryId: null,
      });
    });

    it('rejects an empty patch without touching the database', async () => {
      await expect(service.updateProduct(9, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a piped empty instance where every field is undefined', async () => {
      await expect(
        service.updateProduct(9, {
          name: undefined,
          description: undefined,
          pricePiasters: undefined,
          stock: undefined,
          status: undefined,
          categoryId: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('maps a missing product (P2025) to NotFoundException', async () => {
      update.mockImplementation(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'An operation failed because it depends on one or more records that were required but not found',
            { code: 'P2025', clientVersion: '6.19.3' },
          ),
        ),
      );

      await expect(
        service.updateProduct(9, { name: 'Ghost' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a nonexistent category (P2003) to BadRequestException', async () => {
      update.mockImplementation(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'Foreign key constraint failed on the field: `categoryId`',
            { code: 'P2003', clientVersion: '6.19.3' },
          ),
        ),
      );

      await expect(
        service.updateProduct(9, { categoryId: 999 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteProduct', () => {
    it('deletes by id', async () => {
      await service.deleteProduct(9);

      expect(remove).toHaveBeenCalledWith({ where: { id: 9 } });
    });

    it('maps a missing product (P2025) to NotFoundException', async () => {
      remove.mockImplementation(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'An operation failed because it depends on one or more records that were required but not found',
            { code: 'P2025', clientVersion: '6.19.3' },
          ),
        ),
      );

      await expect(service.deleteProduct(9)).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
