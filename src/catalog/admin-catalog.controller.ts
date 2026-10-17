import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CatalogService } from './catalog.service';
import { AdminProductResponseDto } from './dto/admin-product-response.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductParamsDto } from './dto/product-params.dto';
import { UpdateProductDto } from './dto/update-product.dto';

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

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (admin only)' })
  @ApiOkResponse({
    type: AdminProductResponseDto,
    description: 'The updated product',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload, empty patch, or nonexistent category',
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  update(
    @Param() params: ProductParamsDto,
    @Body() dto: UpdateProductDto,
  ): Promise<AdminProductResponseDto> {
    return this.catalog.updateProduct(params.id, dto);
  }
}
