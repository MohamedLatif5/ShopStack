import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export enum ProductSort {
  Newest = 'newest',
  PriceAsc = 'price_asc',
  PriceDesc = 'price_desc',
  NameAsc = 'name_asc',
  NameDesc = 'name_desc',
}

@ValidatorConstraint({ name: 'minPriceNotGreaterThanMaxPrice', async: false })
class MinPriceNotGreaterThanMaxPrice implements ValidatorConstraintInterface {
  validate(minPrice: number, args: ValidationArguments): boolean {
    const { maxPrice } = args.object as ListProductsQueryDto;
    return maxPrice === undefined || minPrice <= maxPrice;
  }

  defaultMessage(): string {
    return 'minPrice must not be greater than maxPrice';
  }
}

export class ListProductsQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @ApiPropertyOptional({
    enum: ProductSort,
    default: ProductSort.Newest,
  })
  @IsEnum(ProductSort)
  sort: ProductSort = ProductSort.Newest;

  @IsOptional()
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @ApiPropertyOptional({ example: 'notebook' })
  @IsString()
  search?: string;

  @IsOptional()
  @ApiPropertyOptional({
    example: 100,
    minimum: 0,
    description: 'Lower price bound in piasters',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Validate(MinPriceNotGreaterThanMaxPrice)
  minPrice?: number;

  @IsOptional()
  @ApiPropertyOptional({
    example: 1000,
    minimum: 0,
    description: 'Upper price bound in piasters',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;
}
