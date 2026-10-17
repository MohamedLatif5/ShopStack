import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CategoryService } from './category.service';
import { CategoryParamsDto } from './dto/category-params.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Admin Catalog')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
@UseGuards(AdminGuard)
@Controller('admin/categories')
export class AdminCategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories (admin only)' })
  @ApiOkResponse({
    type: CategoryResponseDto,
    isArray: true,
    description: 'Every category, active and inactive',
  })
  list(): Promise<CategoryResponseDto[]> {
    return this.categories.listCategories();
  }

  @Post()
  @ApiOperation({ summary: 'Create a category (admin only)' })
  @ApiCreatedResponse({
    type: CategoryResponseDto,
    description: 'The created category',
  })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiConflictResponse({ description: 'Category name already taken' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categories.createCategory(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category (admin only)' })
  @ApiOkResponse({
    type: CategoryResponseDto,
    description: 'The updated category',
  })
  @ApiBadRequestResponse({ description: 'Invalid payload or empty patch' })
  @ApiConflictResponse({ description: 'Category name already taken' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  update(
    @Param() params: CategoryParamsDto,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.updateCategory(params.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category (admin only)' })
  @ApiNoContentResponse({ description: 'The category was deleted' })
  @ApiConflictResponse({ description: 'Category still has linked products' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  remove(@Param() params: CategoryParamsDto): Promise<void> {
    return this.categories.deleteCategory(params.id);
  }
}
