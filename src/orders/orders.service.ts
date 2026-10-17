import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  MovementReason,
  OrderStatus,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto } from './dto/checkout.dto';

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
}
