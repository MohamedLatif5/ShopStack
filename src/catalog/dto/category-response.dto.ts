import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Books' })
  name: string;

  @ApiPropertyOptional({ example: 'Printed works', nullable: true })
  description: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}
