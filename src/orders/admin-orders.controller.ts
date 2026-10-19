import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ProductParamsDto } from '../catalog/dto/product-params.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import {
  AdminOrderResponseDto,
  ListAdminOrdersResponseDto,
} from './dto/admin-order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('Admin Orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing, malformed, or invalid token',
})
@UseGuards(AdminGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders, newest first, per-customer view' })
  @ApiOkResponse({ type: ListAdminOrdersResponseDto })
  list(
    @Query() query: ListAdminOrdersQueryDto,
  ): Promise<ListAdminOrdersResponseDto> {
    return this.orders.listOrders(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return any single order with its customer' })
  @ApiOkResponse({ type: AdminOrderResponseDto })
  @ApiNotFoundResponse({ description: 'No such order' })
  getOne(@Param() params: ProductParamsDto): Promise<AdminOrderResponseDto> {
    return this.orders.getOrder(params.id);
  }
}
