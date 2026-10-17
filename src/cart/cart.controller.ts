import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartItemResponseDto } from './dto/cart-item-response.dto';
import { CartResponseDto } from './dto/cart-response.dto';

@ApiTags('Cart')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'View the cart with live product data' })
  @ApiOkResponse({
    type: CartResponseDto,
    description: 'The current cart items in insertion order',
  })
  list(@Req() request: AuthenticatedRequest): Promise<CartResponseDto> {
    return this.cart.getCart(request.user.userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a product to the cart' })
  @ApiCreatedResponse({
    type: CartItemResponseDto,
    description: 'The added cart item with live product data',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload (non-positive quantity or productId)',
  })
  @ApiNotFoundResponse({ description: 'Product not found or not available' })
  @ApiConflictResponse({
    description: 'Insufficient stock or product already in the cart',
  })
  add(
    @Body() dto: AddCartItemDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CartItemResponseDto> {
    return this.cart.addItem(request.user.userId, dto);
  }
}
