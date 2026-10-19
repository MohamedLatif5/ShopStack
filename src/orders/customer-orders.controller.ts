import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { ProductParamsDto } from '../catalog/dto/product-params.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListOrdersResponseDto } from './dto/list-orders-response.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing, malformed, or invalid token',
})
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class CustomerOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({
    summary: "List the authenticated customer's own orders, newest first",
  })
  @ApiOkResponse({ type: ListOrdersResponseDto })
  listMine(
    @Query() query: ListOrdersQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ListOrdersResponseDto> {
    return this.orders.listMyOrders(request.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: "Return one of the authenticated customer's own orders",
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({
    description: 'No such order for this customer (missing or foreign)',
  })
  getMine(
    @Param() params: ProductParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderResponseDto> {
    return this.orders.getMyOrder(request.user.userId, params.id);
  }
}
