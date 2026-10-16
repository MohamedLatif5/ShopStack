import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductParamsDto } from './dto/product-params.dto';

@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalog.listActiveProducts(query);
  }

  @Get(':id')
  getProduct(@Param() params: ProductParamsDto) {
    return this.catalog.getActiveProduct(params.id);
  }
}
