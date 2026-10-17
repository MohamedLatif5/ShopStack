import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovementReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

const MOVEMENT_SELECT = {
  id: true,
  productId: true,
  delta: true,
  reason: true,
  note: true,
  createdAt: true,
} satisfies Prisma.InventoryMovementSelect;

export interface StockMovement {
  id: number;
  productId: number;
  delta: number;
  reason: MovementReason;
  note: string | null;
  createdAt: Date;
}

export interface StockAdjustmentResult extends StockMovement {
  stockAfter: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies a relative stock change atomically and records a ledger
   * movement. The conditional update (`stock >= -delta`) is what keeps
   * stock non-negative under concurrency: two racing requests can never
   * both pass, because each row update is serialized by the database.
   */
  async adjustStock(
    productId: number,
    dto: AdjustStockDto,
    actorId: number | null,
  ): Promise<StockAdjustmentResult> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: { id: productId, stock: { gte: -dto.delta } },
        data: { stock: { increment: dto.delta } },
      });

      if (updated.count === 0) {
        const existing = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        });
        if (!existing) {
          throw new NotFoundException(`Product ${productId} was not found`);
        }
        throw new ConflictException(
          `Insufficient stock: current stock is ${existing.stock}, cannot apply delta ${dto.delta}`,
        );
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          delta: dto.delta,
          reason: dto.reason ?? 'ADJUSTMENT',
          note: dto.note ?? null,
          createdById: actorId,
        },
        select: MOVEMENT_SELECT,
      });

      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { stock: true },
      });

      return { ...movement, stockAfter: product?.stock ?? 0 };
    });
  }
}
