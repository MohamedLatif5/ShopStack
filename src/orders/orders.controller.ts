import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('Checkout')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing, malformed, or invalid token',
})
@UseGuards(JwtAuthGuard)
@Controller('checkout')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Place a cash-on-delivery order from the current cart',
  })
  @ApiOkResponse({
    type: OrderResponseDto,
    description: 'Order created with PENDING status',
  })
  @ApiBadRequestResponse({
    description: 'Invalid shipping details or an empty cart',
  })
  @ApiConflictResponse({
    description: 'A cart product is inactive or out of stock',
  })
  checkout(
    @Body() dto: CheckoutDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderResponseDto> {
    return this.orders.checkout(request.user.userId, dto);
  }
}
