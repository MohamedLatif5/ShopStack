import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

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
}
