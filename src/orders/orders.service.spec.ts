import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CheckoutDto } from './dto/checkout.dto';
import type { AdminOrderRecord, OrderRecord } from './orders.service';
import { OrdersService } from './orders.service';

const dto: CheckoutDto = {
  fullName: 'Sara Ali',
  phone: '01000000000',
  address: 'Cairo, Egypt',
};

const alphaLine = {
  id: 1,
  quantity: 2,
  product: {
    id: 10,
    name: 'Alpha Notebook',
    pricePiasters: 1500,
    stock: 5,
    status: 'ACTIVE' as ProductStatus,
  },
};

const betaLine = {
  id: 2,
  quantity: 1,
  product: {
    id: 11,
    name: 'Beta Pen',
    pricePiasters: 300,
    stock: 8,
    status: 'ACTIVE' as ProductStatus,
  },
};

const createdOrder = {
  id: 77,
  status: 'PENDING',
  totalPiasters: 3300,
  shippingName: 'Sara Ali',
  shippingPhone: '01000000000',
  shippingAddress: 'Cairo, Egypt',
  createdAt: new Date('2026-10-17T10:00:00.000Z'),
  items: [],
} as unknown as OrderRecord;

const adminOrder = {
  ...createdOrder,
  customer: { id: 42, email: 'sara@example.com', fullName: 'Sara Ali' },
} as unknown as AdminOrderRecord;

describe('OrdersService', () => {
  let service: OrdersService;

  const capturedUpdateManyArgs: Array<{
    where: { id: number; stock: { gte: number } };
    data: { stock: { decrement: number } };
  }> = [];
  const capturedOrderCreateArgs: Array<{ data: Record<string, unknown> }> = [];
  const capturedMovementArgs: Array<{
    data: {
      productId: number;
      delta: number;
      reason: string;
      note: string;
      createdById: number;
    };
  }> = [];
  const capturedDeleteManyArgs: Array<{ where: { customerId: number } }> = [];

  let cartLinesResult: Array<typeof alphaLine | typeof betaLine> = [];
  let updateManyResult: { count: number } = { count: 1 };
  let orderFindManyResult: OrderRecord[] = [];
  let orderCountResult = 0;
  let orderFindFirstResult: OrderRecord | null = createdOrder;
  let orderFindUniqueResult: AdminOrderRecord | null = adminOrder;

  let orderCreateCalls = 0;
  let movementCreateCalls = 0;

  const capturedOrderFindManyArgs: Array<{
    where?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }> = [];
  const capturedOrderCountArgs: Array<{ where?: unknown }> = [];
  const capturedOrderFindFirstArgs: Array<{ where?: unknown }> = [];
  const capturedOrderFindUniqueArgs: Array<{ where?: unknown }> = [];

  beforeEach(() => {
    capturedUpdateManyArgs.length = 0;
    capturedOrderCreateArgs.length = 0;
    capturedMovementArgs.length = 0;
    capturedDeleteManyArgs.length = 0;
    capturedOrderFindManyArgs.length = 0;
    capturedOrderCountArgs.length = 0;
    capturedOrderFindFirstArgs.length = 0;
    capturedOrderFindUniqueArgs.length = 0;
    cartLinesResult = [alphaLine, betaLine];
    updateManyResult = { count: 1 };
    orderFindManyResult = [adminOrder];
    orderCountResult = 12;
    orderFindFirstResult = createdOrder;
    orderFindUniqueResult = adminOrder;
    orderCreateCalls = 0;
    movementCreateCalls = 0;

    const tx = {
      cartItem: {
        findMany: jest.fn(() => Promise.resolve(cartLinesResult)),
        deleteMany: jest.fn((args: { where: { customerId: number } }) => {
          capturedDeleteManyArgs.push(args);
          return Promise.resolve({ count: cartLinesResult.length });
        }),
      },
      product: {
        updateMany: jest.fn(
          (args: {
            where: { id: number; stock: { gte: number } };
            data: { stock: { decrement: number } };
          }) => {
            capturedUpdateManyArgs.push(args);
            return Promise.resolve(updateManyResult);
          },
        ),
      },
      order: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          orderCreateCalls += 1;
          capturedOrderCreateArgs.push(args);
          return Promise.resolve(createdOrder);
        }),
      },
      inventoryMovement: {
        create: jest.fn(
          (args: {
            data: {
              productId: number;
              delta: number;
              reason: string;
              note: string;
              createdById: number;
            };
          }) => {
            movementCreateCalls += 1;
            capturedMovementArgs.push(args);
            return Promise.resolve({});
          },
        ),
      },
    };

    const prismaStub = {
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<OrderRecord>) =>
        fn(tx),
      ),
      order: {
        findMany: jest.fn(
          (args: {
            where?: unknown;
            orderBy?: unknown;
            skip?: number;
            take?: number;
          }) => {
            capturedOrderFindManyArgs.push(args);
            return Promise.resolve(orderFindManyResult);
          },
        ),
        count: jest.fn((args: { where?: unknown }) => {
          capturedOrderCountArgs.push(args);
          return Promise.resolve(orderCountResult);
        }),
        findFirst: jest.fn((args: { where?: unknown }) => {
          capturedOrderFindFirstArgs.push(args);
          return Promise.resolve(orderFindFirstResult);
        }),
        findUnique: jest.fn((args: { where?: unknown }) => {
          capturedOrderFindUniqueArgs.push(args);
          return Promise.resolve(orderFindUniqueResult);
        }),
      },
    } as unknown as PrismaService;

    service = new OrdersService(prismaStub);
  });

  describe('checkout', () => {
    it('charges server-side totals from live product prices', async () => {
      const result = await service.checkout(42, dto);

      expect(result).toBe(createdOrder);
      expect(capturedOrderCreateArgs[0]?.data).toMatchObject({
        customerId: 42,
        totalPiasters: 3300,
        shippingName: 'Sara Ali',
        shippingPhone: '01000000000',
        shippingAddress: 'Cairo, Egypt',
      });
      expect(capturedOrderCreateArgs[0]?.data.items).toMatchObject({
        create: [
          {
            productId: 10,
            productName: 'Alpha Notebook',
            unitPricePiasters: 1500,
            quantity: 2,
          },
          {
            productId: 11,
            productName: 'Beta Pen',
            unitPricePiasters: 300,
            quantity: 1,
          },
        ],
      });
    });

    it('deducts stock conditionally and atomically per item', async () => {
      await service.checkout(42, dto);

      expect(capturedUpdateManyArgs).toEqual([
        {
          where: { id: 10, stock: { gte: 2 } },
          data: { stock: { decrement: 2 } },
        },
        {
          where: { id: 11, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        },
      ]);
    });

    it('writes a SALE ledger movement per item and empties the cart', async () => {
      await service.checkout(42, dto);

      expect(capturedMovementArgs).toEqual([
        {
          data: {
            productId: 10,
            delta: -2,
            reason: 'SALE',
            note: 'Order #77',
            createdById: 42,
          },
        },
        {
          data: {
            productId: 11,
            delta: -1,
            reason: 'SALE',
            note: 'Order #77',
            createdById: 42,
          },
        },
      ]);
      expect(capturedDeleteManyArgs).toEqual([{ where: { customerId: 42 } }]);
    });

    it('rejects an empty cart without touching anything', async () => {
      cartLinesResult = [];

      await expect(service.checkout(42, dto)).rejects.toThrow(
        new BadRequestException('Cart is empty'),
      );
      expect(capturedUpdateManyArgs).toHaveLength(0);
      expect(orderCreateCalls).toBe(0);
    });

    it('rejects an inactive cart product before any stock changes', async () => {
      cartLinesResult = [
        alphaLine,
        {
          ...betaLine,
          product: { ...betaLine.product, status: ProductStatus.INACTIVE },
        },
      ];

      await expect(service.checkout(42, dto)).rejects.toThrow(
        new ConflictException('Product Beta Pen is no longer available'),
      );
      expect(capturedUpdateManyArgs).toHaveLength(0);
      expect(orderCreateCalls).toBe(0);
    });

    it('rejects when conditional stock deduction matches no row', async () => {
      updateManyResult = { count: 0 };

      await expect(service.checkout(42, dto)).rejects.toThrow(
        new ConflictException(
          'Insufficient stock: only 5 left of Alpha Notebook',
        ),
      );
      expect(orderCreateCalls).toBe(0);
      expect(movementCreateCalls).toBe(0);
      expect(capturedDeleteManyArgs).toHaveLength(0);
    });
  });

  describe('listMyOrders', () => {
    it('scopes the query to the token customer, newest first, paginated', async () => {
      orderFindManyResult = [createdOrder];

      const result = await service.listMyOrders(42, { page: 2, limit: 5 });

      expect(result).toEqual({
        items: [createdOrder],
        meta: { page: 2, limit: 5, total: 12, totalPages: 3 },
      });
      expect(capturedOrderFindManyArgs[0]).toMatchObject({
        where: { customerId: 42 },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(capturedOrderCountArgs[0]?.where).toEqual({ customerId: 42 });
    });

    it('defaults to page 1 with a limit of 10', async () => {
      await service.listMyOrders(42, {});

      expect(capturedOrderFindManyArgs[0]?.skip).toBe(0);
      expect(capturedOrderFindManyArgs[0]?.take).toBe(10);
    });

    it('returns an empty page without erroring', async () => {
      orderFindManyResult = [];
      orderCountResult = 0;

      const result = await service.listMyOrders(42, {});

      expect(result).toEqual({
        items: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });
  });

  describe('getMyOrder', () => {
    it('returns the order when it belongs to the customer', async () => {
      const result = await service.getMyOrder(42, 77);

      expect(result).toBe(createdOrder);
      expect(capturedOrderFindFirstArgs[0]?.where).toEqual({
        id: 77,
        customerId: 42,
      });
    });

    it("hides other customers' orders behind the same 404", async () => {
      orderFindFirstResult = null;

      await expect(service.getMyOrder(42, 77)).rejects.toThrow(
        new NotFoundException('Order 77 was not found'),
      );
    });
  });

  describe('listOrders (admin)', () => {
    it('lists every order, newest first, without a filter', async () => {
      const result = await service.listOrders({});

      expect(result).toEqual({
        items: [adminOrder],
        meta: { page: 1, limit: 10, total: 12, totalPages: 2 },
      });
      expect(capturedOrderFindManyArgs[0]).toMatchObject({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      });
    });

    it('filters by status when provided', async () => {
      await service.listOrders({ status: 'PENDING' });

      expect(capturedOrderFindManyArgs[0]?.where).toEqual({
        status: 'PENDING',
      });
      expect(capturedOrderCountArgs[0]?.where).toEqual({ status: 'PENDING' });
    });

    it('paginates with page and limit', async () => {
      await service.listOrders({ page: 3, limit: 5 });

      expect(capturedOrderFindManyArgs[0]?.skip).toBe(10);
      expect(capturedOrderFindManyArgs[0]?.take).toBe(5);
    });
  });

  describe('getOrder (admin)', () => {
    it('returns any order with its customer', async () => {
      const result = await service.getOrder(77);

      expect(result).toBe(adminOrder);
      expect(capturedOrderFindUniqueArgs[0]?.where).toEqual({ id: 77 });
    });

    it('returns 404 for a missing order', async () => {
      orderFindUniqueResult = null;

      await expect(service.getOrder(999)).rejects.toThrow(
        new NotFoundException('Order 999 was not found'),
      );
    });
  });
});
