import { ApiProperty } from '@nestjs/swagger';

export class CategoryBriefDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Books' })
  name: string;
}

export class ProductResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Alpha Notebook' })
  name: string;

  @ApiProperty({ example: 'A sturdy notebook', nullable: true })
  description: string | null;

  @ApiProperty({
    example: 1500,
    description: 'Price in piasters (1 EGP = 100)',
  })
  pricePiasters: number;

  @ApiProperty({ example: 12 })
  stock: number;

  @ApiProperty({
    type: CategoryBriefDto,
    nullable: true,
    description: 'The linked category, or null when uncategorized',
  })
  category: CategoryBriefDto | null;

  @ApiProperty({ example: '2026-10-16T10:00:00.000Z' })
  createdAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class ListProductsResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items: ProductResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
