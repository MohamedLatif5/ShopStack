import { ProductStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Alpha Notebook' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'A sturdy notebook', nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 1500,
    description: 'Price in piasters (1 EGP = 100)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePiasters: number;

  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description: 'Existing category id; null or omitted for none',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;
}
