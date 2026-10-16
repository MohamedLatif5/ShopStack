import { Type } from 'class-transformer';
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsEnum(ProductSort)
  sort: ProductSort = ProductSort.Newest;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Validate(MinPriceNotGreaterThanMaxPrice)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;
}
