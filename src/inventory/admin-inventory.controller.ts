import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { ProductParamsDto } from '../catalog/dto/product-params.dto';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { StockAdjustmentResponseDto } from './dto/stock-adjustment-response.dto';
import { ListStockMovementsResponseDto } from './dto/stock-movement-response.dto';

@ApiTags('Admin Inventory')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
@UseGuards(AdminGuard)
@Controller('admin/products')
export class AdminInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post(':id/stock')
  @ApiOperation({ summary: 'Apply a stock adjustment (admin only)' })
  @ApiCreatedResponse({
    type: StockAdjustmentResponseDto,
    description: 'The recorded movement and the resulting stock',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload (delta must be a non-zero integer)',
  })
  @ApiConflictResponse({ description: 'Insufficient stock' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  adjust(
    @Param() params: ProductParamsDto,
    @Body() dto: AdjustStockDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<StockAdjustmentResponseDto> {
    return this.inventory.adjustStock(params.id, dto, request.user.userId);
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'List stock movements for a product (admin only)' })
  @ApiOkResponse({
    type: ListStockMovementsResponseDto,
    description: 'A newest-first page of stock movements',
  })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  listMovements(
    @Param() params: ProductParamsDto,
    @Query() query: ListMovementsQueryDto,
  ): Promise<ListStockMovementsResponseDto> {
    return this.inventory.listProductMovements(params.id, query);
  }
}
