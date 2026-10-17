import { MovementReason } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class MovementActorDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ example: 'admin@shopstack.dev' })
  email: string;

  @ApiProperty({ nullable: true })
  fullName: string | null;
}

export class StockMovementResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  productId: number;

  @ApiProperty({ example: -3 })
  delta: number;

  @ApiProperty({ enum: MovementReason })
  reason: MovementReason;

  @ApiProperty({ nullable: true, example: 'Shipment #14' })
  note: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: MovementActorDto, nullable: true })
  createdBy: MovementActorDto | null;
}

export class MovementListMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class ListStockMovementsResponseDto {
  @ApiProperty({ type: [StockMovementResponseDto] })
  items: StockMovementResponseDto[];

  @ApiProperty({ type: MovementListMetaDto })
  meta: MovementListMetaDto;
}
