import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { InventoryService } from './inventory.service';

type UpdateManyArgs = {
  where: { id: number; stock: { gte: number } };
  data: { stock: { increment: number } };
};

type MovementCreateArgs = {
  data: {
    productId: number;
    delta: number;
    reason: string;
    note: string | null;
    createdById: number | null;
  };
};

type MovementFindManyArgs = {
  where: { productId: number };
  orderBy: { createdAt: string; id: string }[];
  skip: number;
  take: number;
};

const movementRecord = {
  id: 11,
  productId: 3,
  delta: 10,
  reason: 'RESTOCK',
  note: 'Shipment #14',
  createdAt: new Date('2026-10-17T10:00:00.000Z'),
};

describe('InventoryService', () => {
  let service: InventoryService;
  let updateMany: jest.Mock;
  let capturedUpdateManyArgs: UpdateManyArgs[];
  let updateManyResult: { count: number };
  let findUnique: jest.Mock;
  let findUniqueResult: { stock: number } | null;
  let movementCreate: jest.Mock;
  let capturedMovementArgs: MovementCreateArgs[];
  let productFindUnique: jest.Mock;
  let productFindUniqueResult: { id: number } | null;
  let movementFindMany: jest.Mock;
  let capturedMovementFindManyArgs: MovementFindManyArgs[];
  let movementFindManyResult: (typeof movementRecord & {
    createdBy: null;
  })[] = [];
  let movementCount: jest.Mock;

  beforeEach(async () => {
    capturedUpdateManyArgs = [];
    updateManyResult = { count: 1 };
    updateMany = jest.fn((args: UpdateManyArgs) => {
      capturedUpdateManyArgs.push(args);
      return Promise.resolve(updateManyResult);
    });
    findUniqueResult = { stock: 15 };
    findUnique = jest.fn(() => Promise.resolve(findUniqueResult));
    capturedMovementArgs = [];
    movementCreate = jest.fn((args: MovementCreateArgs) => {
      capturedMovementArgs.push(args);
      return Promise.resolve(movementRecord);
    });
    productFindUniqueResult = { id: 3 };
    productFindUnique = jest.fn(() => Promise.resolve(productFindUniqueResult));
    capturedMovementFindManyArgs = [];
    movementFindManyResult = [];
    movementFindMany = jest.fn((args: MovementFindManyArgs) => {
      capturedMovementFindManyArgs.push(args);
      return Promise.resolve(movementFindManyResult);
    });
    movementCount = jest.fn().mockResolvedValue(0);

    const tx = {
      product: { updateMany, findUnique },
      inventoryMovement: { create: movementCreate },
    };
    const prismaMock = {
      product: { findUnique: productFindUnique },
      inventoryMovement: { findMany: movementFindMany, count: movementCount },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(InventoryService);
  });

  describe('adjustStock', () => {
    it('applies the delta conditionally and records the movement', async () => {
      const dto = new AdjustStockDto();
      dto.delta = 10;
      dto.reason = 'RESTOCK';
      dto.note = 'Shipment #14';

      const result = await service.adjustStock(3, dto, 7);

      expect(result).toEqual({ ...movementRecord, stockAfter: 15 });
      expect(capturedUpdateManyArgs).toEqual([
        {
          where: { id: 3, stock: { gte: -10 } },
          data: { stock: { increment: 10 } },
        },
      ]);
      expect(capturedMovementArgs).toHaveLength(1);
      expect(capturedMovementArgs[0]?.data).toEqual({
        productId: 3,
        delta: 10,
        reason: 'RESTOCK',
        note: 'Shipment #14',
        createdById: 7,
      });
    });

    it('defaults reason to ADJUSTMENT and note to null', async () => {
      const dto = new AdjustStockDto();
      dto.delta = -2;

      await service.adjustStock(3, dto, null);

      expect(capturedMovementArgs[0]?.data.reason).toBe('ADJUSTMENT');
      expect(capturedMovementArgs[0]?.data.note).toBeNull();
      expect(capturedMovementArgs[0]?.data.createdById).toBeNull();
    });

    it('rejects a delta that would make the stock negative', async () => {
      updateManyResult = { count: 0 };
      findUniqueResult = { stock: 2 };

      const dto = new AdjustStockDto();
      dto.delta = -5;

      await expect(service.adjustStock(3, dto, 7)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.adjustStock(3, dto, 7)).rejects.toThrow(
        'Insufficient stock: current stock is 2, cannot apply delta -5',
      );
      expect(movementCreate).not.toHaveBeenCalled();
    });

    it('maps a missing product to not found', async () => {
      updateManyResult = { count: 0 };
      findUniqueResult = null;

      const dto = new AdjustStockDto();
      dto.delta = 5;

      await expect(service.adjustStock(77, dto, 7)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.adjustStock(77, dto, 7)).rejects.toThrow(
        'Product 77 was not found',
      );
      expect(movementCreate).not.toHaveBeenCalled();
    });
  });

  describe('listProductMovements', () => {
    const query = (overrides: Partial<ListMovementsQueryDto> = {}) =>
      Object.assign(new ListMovementsQueryDto(), {
        page: 1,
        limit: 10,
        ...overrides,
      });

    it('returns a newest-first page with pagination meta', async () => {
      const items = [{ ...movementRecord, createdBy: null }];
      movementFindManyResult = items;
      movementCount.mockResolvedValue(12);

      const result = await service.listProductMovements(
        3,
        query({ page: 2, limit: 5 }),
      );

      expect(result).toEqual({
        items,
        meta: { page: 2, limit: 5, total: 12, totalPages: 3 },
      });
      expect(capturedMovementFindManyArgs.at(-1)).toMatchObject({
        where: { productId: 3 },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(movementCount).toHaveBeenCalledWith({
        where: { productId: 3 },
      });
    });

    it('defaults pagination to page 1 and limit 10', async () => {
      await service.listProductMovements(3, new ListMovementsQueryDto());

      expect(capturedMovementFindManyArgs.at(-1)).toMatchObject({
        skip: 0,
        take: 10,
      });
    });

    it('rejects a missing product as not found', async () => {
      productFindUniqueResult = null;

      await expect(service.listProductMovements(77, query())).rejects.toThrow(
        NotFoundException,
      );
      expect(movementFindMany).not.toHaveBeenCalled();
      expect(movementCount).not.toHaveBeenCalled();
    });
  });
});
