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
  const capturedFindFirstArgs: { where?: unknown; select?: unknown }[] = [];
  const capturedCreateArgs: { data?: unknown; select?: unknown }[] = [];
  const capturedFindManyArgs: {
    where?: unknown;
    orderBy?: unknown;
    select?: unknown;
  }[] = [];

  beforeEach(() => {
    capturedFindFirstArgs.length = 0;
    capturedCreateArgs.length = 0;
    capturedFindManyArgs.length = 0;

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

    const prismaStub = {
      product: { findFirst: productFindFirst },
      cartItem: { create: itemCreate, findMany: itemFindMany },
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
});
