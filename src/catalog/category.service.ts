import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
} satisfies Prisma.CategorySelect;

export interface CategoryRecord {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(dto: CreateCategoryDto): Promise<CategoryRecord> {
    try {
      return await this.prisma.category.create({
        data: { name: dto.name, description: dto.description ?? null },
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }
  }

  async updateCategory(
    id: number,
    dto: UpdateCategoryDto,
  ): Promise<CategoryRecord> {
    const provided = Object.entries(dto).filter(
      ([, value]) => value !== undefined,
    );
    if (provided.length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    const data: Prisma.CategoryUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.category.update({
        where: { id },
        data,
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      if (this.isMissing(error)) {
        throw new NotFoundException(`Category ${id} was not found`);
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }
  }

  /** Admin listing: every category, active and inactive, in a stable order. */
  listCategories(): Promise<CategoryRecord[]> {
    return this.prisma.category.findMany({
      select: CATEGORY_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isMissing(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
