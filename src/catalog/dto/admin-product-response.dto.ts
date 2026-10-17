import { ProductStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryBriefDto } from './product-response.dto';

export class AdminProductResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Alpha Notebook' })
  name: string;

  @ApiPropertyOptional({ example: 'A sturdy notebook', nullable: true })
  description: string | null;

  @ApiProperty({
    example: 1500,
    description: 'Price in piasters (1 EGP = 100)',
  })
  pricePiasters: number;

  @ApiProperty({ example: 12 })
  stock: number;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ example: '2026-10-16T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-16T10:00:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ type: CategoryBriefDto, nullable: true })
  category: CategoryBriefDto | null;
}
