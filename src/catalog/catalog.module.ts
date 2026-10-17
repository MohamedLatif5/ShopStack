import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCategoryController } from './admin-category.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CategoryService } from './category.service';

@Module({
  imports: [AuthModule],
  controllers: [
    CatalogController,
    AdminCatalogController,
    AdminCategoryController,
  ],
  providers: [CatalogService, CategoryService],
})
export class CatalogModule {}
