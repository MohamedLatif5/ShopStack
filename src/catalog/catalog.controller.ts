import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import {
  ListProductsResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';
import { ProductParamsDto } from './dto/product-params.dto';

@ApiTags('Products')
@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List active products with pagination and filters' })
  @ApiOkResponse({
    description: 'A page of active products with pagination meta',
    type: ListProductsResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  listProducts(
    @Query() query: ListProductsQueryDto,
  ): Promise<ListProductsResponseDto> {
    return this.catalog.listActiveProducts(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get the details of an active product' })
  @ApiOkResponse({
    description: 'The active product with the requested id',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid product id' })
  @ApiNotFoundResponse({
    description: 'No active product exists with this id',
  })
  getProduct(@Param() params: ProductParamsDto): Promise<ProductResponseDto> {
    return this.catalog.getActiveProduct(params.id);
  }
}
