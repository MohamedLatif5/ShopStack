import { ApiProperty } from '@nestjs/swagger';

export class CartProductBriefDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ example: 'Alpha Notebook' })
  name: string;

  @ApiProperty({
    example: 1500,
    description: 'Current price in piasters (1 EGP = 100)',
  })
  pricePiasters: number;

  @ApiProperty({ example: 5 })
  stock: number;
}

export class CartItemResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  productId: number;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ type: CartProductBriefDto })
  product: CartProductBriefDto;

  @ApiProperty()
  createdAt: Date;
}
