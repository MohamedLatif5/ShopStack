import { Controller, Get, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalog.listActiveProducts(query);
  }
}
