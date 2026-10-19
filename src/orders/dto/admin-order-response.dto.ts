import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../catalog/dto/product-response.dto';
import { OrderResponseDto } from './order-response.dto';

export class OrderCustomerDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'sara@example.com' })
  email: string;

  @ApiProperty({ example: 'Sara Ali', nullable: true })
  fullName: string | null;
}

export class AdminOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ type: OrderCustomerDto })
  customer: OrderCustomerDto;
}

export class ListAdminOrdersResponseDto {
  @ApiProperty({ type: [AdminOrderResponseDto] })
  items: AdminOrderResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
