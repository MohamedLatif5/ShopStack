import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const CART_ITEM_SELECT = {
  id: true,
  productId: true,
  quantity: true,
  createdAt: true,
  product: {
    select: { id: true, name: true, pricePiasters: true, stock: true },
  },
} satisfies Prisma.CartItemSelect;

export interface CartProductBrief {
  id: number;
  name: string;
  pricePiasters: number;
  stock: number;
}

export interface CartItemRecord {
  id: number;
  productId: number;
  quantity: number;
  createdAt: Date;
  product: CartProductBrief;
}

export interface CartRecord {
  items: CartItemRecord[];
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the customer's cart with live product data. Prices and stock
   * are read from the current product rows, never stored in the cart.
   */
  async getCart(customerId: number): Promise<CartRecord> {
    const items = await this.prisma.cartItem.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: CART_ITEM_SELECT,
    });
    return { items };
  }

  /**
   * Adds a product to the customer's cart. The customer id always comes
   * from the token, never from the payload, so ownership cannot be forged.
   */
  async addItem(
    customerId: number,
    dto: AddCartItemDto,
  ): Promise<CartItemRecord> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: ProductStatus.ACTIVE },
      select: { id: true, name: true, pricePiasters: true, stock: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} was not found`);
    }
    if (dto.quantity > product.stock) {
      throw new ConflictException(
        `Insufficient stock: only ${product.stock} left of ${product.name}`,
      );
    }

    try {
      return await this.prisma.cartItem.create({
        data: {
          customerId,
          productId: dto.productId,
          quantity: dto.quantity,
        },
        select: CART_ITEM_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product is already in your cart');
      }
      throw error;
    }
  }

  /**
   * Updates the quantity of an owned cart item. Foreign items are treated
   * as missing so carts cannot be probed across customers.
   */
  async updateItem(
    customerId: number,
    itemId: number,
    dto: UpdateCartItemDto,
  ): Promise<CartItemRecord> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, customerId },
      select: {
        id: true,
        product: {
          select: { id: true, name: true, pricePiasters: true, stock: true },
        },
      },
    });
    if (!item) {
      throw new NotFoundException(`Cart item ${itemId} was not found`);
    }
    if (dto.quantity > item.product.stock) {
      throw new ConflictException(
        `Insufficient stock: only ${item.product.stock} left of ${item.product.name}`,
      );
    }

    try {
      return await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
        select: CART_ITEM_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Cart item ${itemId} was not found`);
      }
      throw error;
    }
  }

  /**
   * Removes an owned cart item. The customer id is part of the delete
   * filter, so another customer's item behaves exactly like a missing one.
   */
  async removeItem(customerId: number, itemId: number): Promise<void> {
    const removed = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, customerId },
    });
    if (removed.count === 0) {
      throw new NotFoundException(`Cart item ${itemId} was not found`);
    }
  }
}
