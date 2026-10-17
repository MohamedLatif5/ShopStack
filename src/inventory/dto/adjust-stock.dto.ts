import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({
    example: 10,
    description: 'Relative change to apply (never 0)',
  })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0, { message: 'delta must not be 0' })
  delta: number;

  @ApiPropertyOptional({
    enum: ['ADJUSTMENT', 'RESTOCK'],
    default: 'ADJUSTMENT',
    description: 'Manual reasons only; SALE/CANCELLATION are system-generated',
  })
  @IsOptional()
  @IsIn(['ADJUSTMENT', 'RESTOCK'])
  reason?: 'ADJUSTMENT' | 'RESTOCK';

  @ApiPropertyOptional({ example: 'Received shipment #14' })
  @IsOptional()
  @IsString()
  note?: string;
}
