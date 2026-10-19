import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    example: OrderStatus.CONFIRMED,
    description: 'New order status; only approved transitions are accepted',
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
