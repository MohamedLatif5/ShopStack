import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
