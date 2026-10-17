import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StockAdjustmentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 3 })
  productId: number;

  @ApiProperty({ example: 10 })
  delta: number;

  @ApiProperty({ example: 'RESTOCK' })
  reason: string;

  @ApiPropertyOptional({ example: 'Received shipment #14', nullable: true })
  note: string | null;

  @ApiProperty({ example: '2026-10-17T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: 15, description: 'Stock after the adjustment' })
  stockAfter: number;
}
