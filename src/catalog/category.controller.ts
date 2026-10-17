import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CategoryResponseDto } from './dto/category-response.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List active categories (public)' })
  @ApiOkResponse({
    type: CategoryResponseDto,
    isArray: true,
    description: 'Active categories in stable name order',
  })
  list(): Promise<CategoryResponseDto[]> {
    return this.categories.listActiveCategories();
  }
}
