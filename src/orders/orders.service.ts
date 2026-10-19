import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MovementReason,
  OrderStatus,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { CheckoutDto } from './dto/checkout.dto';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ORDER_SELECT = {
  id: true,
  status: true,
  totalPiasters: true,
  shippingName: true,
  shippingPhone: true,
  shippingAddress: true,
  createdAt: true,
  items: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productId: true,
      productName: true,
      unitPricePiasters: true,
      quantity: true,
    },
  },
} satisfies Prisma.OrderSelect;

const ADMIN_ORDER_SELECT = {
  ...ORDER_SELECT,
  customer: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.OrderSelect;

/** Approved order status transitions (docs/BUSINESS_RULES.md §6). */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export interface OrderItemRecord {
  id: number;
  productId: number | null;
  productName: string;
  unitPricePiasters: number;
  quantity: number;
}

export interface OrderRecord {
  id: number;
  status: OrderStatus;
  totalPiasters: number;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  createdAt: Date;
  items: OrderItemRecord[];
}

interface CartLine {
  id: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    pricePiasters: number;
    stock: number;
    status: ProductStatus;
  };
}

export interface ListOrdersResult {
  items: OrderRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderCustomer {
  id: number;
  email: string;
  fullName: string | null;
}

export interface AdminOrderRecord extends OrderRecord {
  customer: OrderCustomer;
}

export interface ListAdminOrdersResult {
  items: AdminOrderRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Places a cash-on-delivery order from the customer's cart.
   * Everything runs inside one transaction: stock is deducted with a
   * conditional atomic UPDATE (no oversell under concurrency), the order
   * and its price snapshots are created, a SALE ledger movement is written
   * per item, and the cart is emptied. Any failure rolls back everything.
   */
  async checkout(customerId: number, dto: CheckoutDto): Promise<OrderRecord> {
    return this.prisma.$transaction(async (tx) => {
      const cartLines: CartLine[] = await tx.cartItem.findMany({
        where: { customerId },
        select: {
          id: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              pricePiasters: true,
              stock: true,
              status: true,
            },
          },
        },
      });

      if (cartLines.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const unavailable = cartLines.find(
        (line) => line.product.status !== ProductStatus.ACTIVE,
      );
      if (unavailable) {
        throw new ConflictException(
          `Product ${unavailable.product.name} is no longer available`,
        );
      }

      for (const line of cartLines) {
        const updated = await tx.product.updateMany({
          where: { id: line.product.id, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (updated.count === 0) {
          throw new ConflictException(
            `Insufficient stock: only ${line.product.stock} left of ${line.product.name}`,
          );
        }
      }

      const totalPiasters = cartLines.reduce(
        (sum, line) => sum + line.product.pricePiasters * line.quantity,
        0,
      );

      const order = await tx.order.create({
        data: {
          customerId,
          totalPiasters,
          shippingName: dto.fullName,
          shippingPhone: dto.phone,
          shippingAddress: dto.address,
          items: {
            create: cartLines.map((line) => ({
              productId: line.product.id,
              productName: line.product.name,
              unitPricePiasters: line.product.pricePiasters,
              quantity: line.quantity,
            })),
          },
        },
        select: ORDER_SELECT,
      });

      for (const line of cartLines) {
        await tx.inventoryMovement.create({
          data: {
            productId: line.product.id,
            delta: -line.quantity,
            reason: MovementReason.SALE,
            note: `Order #${order.id}`,
            createdById: customerId,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { customerId } });

      return order;
    });
  }

  /** Lists the authenticated customer's own orders, newest first. */
  async listMyOrders(
    customerId: number,
    query: ListOrdersQueryDto,
  ): Promise<ListOrdersResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = { customerId };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: ORDER_SELECT,
      }),
      this.prisma.order.count({ where }),
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

  /** Returns one order, but only when it belongs to this customer. */
  async getMyOrder(customerId: number, orderId: number): Promise<OrderRecord> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: ORDER_SELECT,
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} was not found`);
    }
    return order;
  }

  /** Admin view: lists every order, newest first, optionally per status. */
  async listOrders(
    query: ListAdminOrdersQueryDto,
  ): Promise<ListAdminOrdersResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: ADMIN_ORDER_SELECT,
      }),
      this.prisma.order.count({ where }),
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

  /** Admin view: returns any single order with its customer. */
  async getOrder(orderId: number): Promise<AdminOrderRecord> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ADMIN_ORDER_SELECT,
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} was not found`);
    }
    return order;
  }

  /**
   * Admin view: moves an order to a new status following the approved
   * transition matrix. Cancelling an order restores the deducted stock
   * atomically, writing CANCELLATION ledger movements per item; items whose
   * product was deleted since the sale (productId null) are skipped.
   */
  async updateOrderStatus(
    orderId: number,
    dto: UpdateOrderStatusDto,
    actorId: number,
  ): Promise<AdminOrderRecord> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: ADMIN_ORDER_SELECT,
      });
      if (!order) {
        throw new NotFoundException(`Order ${orderId} was not found`);
      }

      const allowed = ALLOWED_TRANSITIONS[order.status];
      if (!allowed.includes(dto.status)) {
        throw new ConflictException(
          `Cannot change order status from ${order.status} to ${dto.status}`,
        );
      }

      if (dto.status === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          if (item.productId === null) {
            continue;
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              delta: item.quantity,
              reason: MovementReason.CANCELLATION,
              note: `Order #${order.id}`,
              createdById: actorId,
            },
          });
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: dto.status },
        select: ADMIN_ORDER_SELECT,
      });
    });
  }
}
