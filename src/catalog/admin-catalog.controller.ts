import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CatalogService } from './catalog.service';
import { AdminProductResponseDto } from './dto/admin-product-response.dto';
import { CreateProductDto } from './dto/create-product.dto';

@ApiTags('Admin Catalog')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
@UseGuards(AdminGuard)
@Controller('admin/products')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product (admin only)' })
  @ApiCreatedResponse({
    type: AdminProductResponseDto,
    description: 'The created product',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload or nonexistent category',
  })
  create(@Body() dto: CreateProductDto): Promise<AdminProductResponseDto> {
    return this.catalog.createProduct(dto);
  }
}
