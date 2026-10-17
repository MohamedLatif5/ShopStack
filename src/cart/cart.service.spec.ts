import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';

const sampleProduct = {
  id: 9,
  name: 'Alpha Notebook',
  pricePiasters: 1500,
  stock: 5,
};

const createdItem = {
  id: 77,
  productId: 9,
  quantity: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  product: sampleProduct,
};

describe('CartService', () => {
  let service: CartService;
  let productFindFirst: jest.Mock;
  let itemCreate: jest.Mock;
  let itemFindMany: jest.Mock;
  let itemFindFirst: jest.Mock;
  let itemUpdate: jest.Mock;
  let itemDeleteMany: jest.Mock;
  let itemFindFirstResult: { id: number; product: typeof sampleProduct } | null;
  const capturedFindFirstArgs: { where?: unknown; select?: unknown }[] = [];
  const capturedCreateArgs: { data?: unknown; select?: unknown }[] = [];
  const capturedFindManyArgs: {
    where?: unknown;
    orderBy?: unknown;
    select?: unknown;
  }[] = [];
  const capturedItemFindFirstArgs: { where?: unknown; select?: unknown }[] = [];
  const capturedUpdateArgs: { where?: unknown; data?: unknown }[] = [];
  const capturedDeleteManyArgs: { where?: unknown }[] = [];

  beforeEach(() => {
    capturedFindFirstArgs.length = 0;
    capturedCreateArgs.length = 0;
    capturedFindManyArgs.length = 0;
    capturedItemFindFirstArgs.length = 0;
    capturedUpdateArgs.length = 0;
    capturedDeleteManyArgs.length = 0;

    const productFindFirstResult: typeof sampleProduct | null = sampleProduct;
    productFindFirst = jest.fn(
      (args: { where?: unknown; select?: unknown }) => {
        capturedFindFirstArgs.push(args);
        return Promise.resolve(productFindFirstResult);
      },
    );

    itemCreate = jest.fn((args: { data?: unknown; select?: unknown }) => {
      capturedCreateArgs.push(args);
      return Promise.resolve(createdItem);
    });

    const itemFindManyResult: (typeof createdItem)[] = [createdItem];
    itemFindMany = jest.fn(
      (args: { where?: unknown; orderBy?: unknown; select?: unknown }) => {
        capturedFindManyArgs.push(args);
        return Promise.resolve(itemFindManyResult);
      },
    );

    itemFindFirstResult = { id: 77, product: sampleProduct };
    itemFindFirst = jest.fn((args: { where?: unknown; select?: unknown }) => {
      capturedItemFindFirstArgs.push(args);
      return Promise.resolve(itemFindFirstResult);
    });

    itemUpdate = jest.fn((args: { where?: unknown; data?: unknown }) => {
      capturedUpdateArgs.push(args);
      return Promise.resolve(createdItem);
    });

    const deleteManyResult: { count: number } = { count: 1 };
    itemDeleteMany = jest.fn((args: { where?: unknown }) => {
      capturedDeleteManyArgs.push(args);
      return Promise.resolve(deleteManyResult);
    });

    const prismaStub = {
      product: { findFirst: productFindFirst },
      cartItem: {
        create: itemCreate,
        findMany: itemFindMany,
        findFirst: itemFindFirst,
        update: itemUpdate,
        deleteMany: itemDeleteMany,
      },
    } as unknown as PrismaService;

    service = new CartService(prismaStub);
  });

  describe('getCart', () => {
    it('returns the cart items scoped to the token customer', async () => {
      const result = await service.getCart(7);

      expect(result).toEqual({ items: [createdItem] });
      expect(capturedFindManyArgs[0]?.where).toEqual({ customerId: 7 });
      expect(capturedFindManyArgs[0]?.orderBy).toEqual([
        { createdAt: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('returns an empty items array for an empty cart', () => {
      const emptyImpl = jest.fn(
        (args: { where?: unknown; orderBy?: unknown }) => {
          capturedFindManyArgs.push(args);
          return Promise.resolve([]);
        },
      );
      itemFindMany.mockImplementation(emptyImpl);

      return service.getCart(7).then((result) => {
        expect(result.items).toEqual([]);
      });
    });
  });

  describe('addItem', () => {
    it('adds the item with the token customer id and live product data', async () => {
      const result = await service.addItem(7, { productId: 9, quantity: 2 });

      expect(result).toEqual(createdItem);
      expect(capturedFindFirstArgs[0]?.where).toEqual({
        id: 9,
        status: ProductStatus.ACTIVE,
      });
      expect(capturedCreateArgs[0]?.data).toEqual({
        customerId: 7,
        productId: 9,
        quantity: 2,
      });
    });

    it('throws NotFound when the product does not exist or is inactive', async () => {
      productFindFirst.mockImplementation((args: unknown) => {
        capturedFindFirstArgs.push(args as { where?: unknown });
        return Promise.resolve(null);
      });

      await expect(
        service.addItem(7, { productId: 42, quantity: 1 }),
      ).rejects.toThrow(new NotFoundException('Product 42 was not found'));
      expect(itemCreate).not.toHaveBeenCalled();
    });

    it('throws Conflict when the quantity exceeds current stock', async () => {
      await expect(
        service.addItem(7, { productId: 9, quantity: 6 }),
      ).rejects.toThrow(
        new ConflictException(
          'Insufficient stock: only 5 left of Alpha Notebook',
        ),
      );
      expect(itemCreate).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint violation to a friendly conflict', async () => {
      itemCreate.mockImplementation(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`customerId`,`productId`)',
            {
              code: 'P2002',
              clientVersion: '6.19.3',
              meta: { target: ['CartItem_customerId_productId_key'] },
            },
          ),
        ),
      );

      await expect(
        service.addItem(7, { productId: 9, quantity: 2 }),
      ).rejects.toThrow(
        new ConflictException('Product is already in your cart'),
      );
    });
  });

  describe('updateItem', () => {
    it('updates the quantity of an owned item', async () => {
      const result = await service.updateItem(7, 77, { quantity: 3 });

      expect(result).toEqual(createdItem);
      expect(capturedItemFindFirstArgs[0]?.where).toEqual({
        id: 77,
        customerId: 7,
      });
      expect(capturedUpdateArgs[0]?.where).toEqual({ id: 77 });
      expect(capturedUpdateArgs[0]?.data).toEqual({ quantity: 3 });
    });

    it('throws NotFound for a foreign or missing item', async () => {
      itemFindFirstResult = null;

      await expect(service.updateItem(7, 77, { quantity: 3 })).rejects.toThrow(
        new NotFoundException('Cart item 77 was not found'),
      );
      expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('throws Conflict when the quantity exceeds current stock', async () => {
      await expect(service.updateItem(7, 77, { quantity: 6 })).rejects.toThrow(
        new ConflictException(
          'Insufficient stock: only 5 left of Alpha Notebook',
        ),
      );
      expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('maps a concurrent delete to NotFound', async () => {
      itemUpdate.mockImplementation((args: { where?: unknown }) => {
        capturedUpdateArgs.push(args);
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'An operation failed because it depends on one or more records that were required but not found',
            {
              code: 'P2025',
              clientVersion: '6.19.3',
              meta: { cause: 'Record to update not found.' },
            },
          ),
        );
      });

      await expect(service.updateItem(7, 77, { quantity: 3 })).rejects.toThrow(
        new NotFoundException('Cart item 77 was not found'),
      );
    });
  });

  describe('removeItem', () => {
    it('removes an owned item', async () => {
      await service.removeItem(7, 77);

      expect(capturedDeleteManyArgs[0]?.where).toEqual({
        id: 77,
        customerId: 7,
      });
    });

    it('throws NotFound for a foreign or missing item', async () => {
      itemDeleteMany.mockImplementation((args: { where?: unknown }) => {
        capturedDeleteManyArgs.push(args);
        return Promise.resolve({ count: 0 });
      });

      await expect(service.removeItem(7, 77)).rejects.toThrow(
        new NotFoundException('Cart item 77 was not found'),
      );
    });
  });
});
