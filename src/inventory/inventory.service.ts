import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovementReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';

const MOVEMENT_SELECT = {
  id: true,
  productId: true,
  delta: true,
  reason: true,
  note: true,
  createdAt: true,
} satisfies Prisma.InventoryMovementSelect;

const MOVEMENT_LIST_SELECT = {
  ...MOVEMENT_SELECT,
  createdBy: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.InventoryMovementSelect;

export interface StockMovement {
  id: number;
  productId: number;
  delta: number;
  reason: MovementReason;
  note: string | null;
  createdAt: Date;
}

export interface MovementActor {
  id: number;
  email: string;
  fullName: string | null;
}

export interface StockMovementWithActor extends StockMovement {
  createdBy: MovementActor | null;
}

export interface ListStockMovementsResult {
  items: StockMovementWithActor[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

  /** Newest-first movement history for one product, paginated. */
  async listProductMovements(
    productId: number,
    query: ListMovementsQueryDto,
  ): Promise<ListStockMovementsResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} was not found`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = { productId };
    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: MOVEMENT_LIST_SELECT,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
