import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
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

    const tx = {
      product: { updateMany, findUnique },
      inventoryMovement: { create: movementCreate },
    };
    const prismaMock = {
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
});
