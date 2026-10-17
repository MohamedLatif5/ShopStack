import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { ProductParamsDto } from '../catalog/dto/product-params.dto';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartItemResponseDto } from './dto/cart-item-response.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

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

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update the quantity of a cart item' })
  @ApiOkResponse({
    type: CartItemResponseDto,
    description: 'The updated cart item with live product data',
  })
  @ApiBadRequestResponse({ description: 'Invalid id or non-positive quantity' })
  @ApiNotFoundResponse({ description: 'Cart item not found for this customer' })
  @ApiConflictResponse({ description: 'Quantity exceeds current stock' })
  update(
    @Param() params: ProductParamsDto,
    @Body() dto: UpdateCartItemDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CartItemResponseDto> {
    return this.cart.updateItem(request.user.userId, params.id, dto);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiNoContentResponse({ description: 'Item removed' })
  @ApiBadRequestResponse({ description: 'Invalid id' })
  @ApiNotFoundResponse({ description: 'Cart item not found for this customer' })
  remove(
    @Param() params: ProductParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.cart.removeItem(request.user.userId, params.id);
  }
}
