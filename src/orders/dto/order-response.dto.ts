import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class OrderItemResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    example: 2,
    nullable: true,
    description: 'null when the product was deleted after the order was placed',
  })
  productId: number | null;

  @ApiProperty({ example: 'Alpha Notebook' })
  productName: string;

  @ApiProperty({
    example: 1500,
    description: 'Price in piasters (1 EGP = 100)',
  })
  unitPricePiasters: number;

  @ApiProperty({ example: 2 })
  quantity: number;
}

export class OrderResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PENDING })
  status: OrderStatus;

  @ApiProperty({
    example: 3300,
    description: 'Total in piasters (1 EGP = 100)',
  })
  totalPiasters: number;

  @ApiProperty({ example: 'Sara Ali' })
  shippingName: string;

  @ApiProperty({ example: '01000000000' })
  shippingPhone: string;

  @ApiProperty({ example: '12 Talaat Harb St., Downtown, Cairo' })
  shippingAddress: string;

  @ApiProperty({ example: '2026-10-17T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];
}
