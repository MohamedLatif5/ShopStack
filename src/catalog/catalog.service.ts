import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  ListProductsQueryDto,
  ProductSort,
} from './dto/list-products-query.dto';

/** Only these fields are ever exposed by the public catalog. */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  pricePiasters: true,
  stock: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

/** Admin view: the public selection plus status and updatedAt. */
const ADMIN_PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  pricePiasters: true,
  stock: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

export interface AdminProduct {
  id: number;
  name: string;
  description: string | null;
  pricePiasters: number;
  stock: number;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
  category: { id: number; name: string } | null;
}

/** Stable ordering: every sort ends with the id tiebreaker. */
const SORT_ORDER: Record<
  ProductSort,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  [ProductSort.Newest]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [ProductSort.PriceAsc]: [{ pricePiasters: 'asc' }, { id: 'asc' }],
  [ProductSort.PriceDesc]: [{ pricePiasters: 'desc' }, { id: 'desc' }],
  [ProductSort.NameAsc]: [{ name: 'asc' }, { id: 'asc' }],
  [ProductSort.NameDesc]: [{ name: 'desc' }, { id: 'desc' }],
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveProducts(query: ListProductsQueryDto) {
    const where = this.buildWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: SORT_ORDER[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: PRODUCT_SELECT,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Admin product creation; a missing category id is an invalid relation, not a 500. */
  async createProduct(dto: CreateProductDto): Promise<AdminProduct> {
    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          pricePiasters: dto.pricePiasters,
          stock: dto.stock,
          status: dto.status ?? ProductStatus.ACTIVE,
          categoryId: dto.categoryId ?? null,
        },
        select: ADMIN_PRODUCT_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          `Category ${dto.categoryId} does not exist`,
        );
      }
      throw error;
    }
  }

  /** Public details are only served for active products; everything else is a 404. */
  async getActiveProduct(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: 'ACTIVE' },
      select: PRODUCT_SELECT,
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} was not found`);
    }
    return product;
  }

  /** The public catalog always filters to active products, then narrows further. */
  private buildWhere(query: ListProductsQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

    if (query.categoryId !== undefined) {
      where.categoryId = query.categoryId;
    }

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.pricePiasters = {
        ...(query.minPrice !== undefined && { gte: query.minPrice }),
        ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
      };
    }

    return where;
  }
}
