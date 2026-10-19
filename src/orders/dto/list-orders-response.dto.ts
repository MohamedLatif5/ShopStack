import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../catalog/dto/product-response.dto';
import { OrderResponseDto } from './order-response.dto';

export class ListOrdersResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items: OrderResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
