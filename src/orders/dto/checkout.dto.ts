import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'Sara Ali' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '01000000000' })
  @IsString()
  @MinLength(7)
  @MaxLength(15)
  phone: string;

  @ApiProperty({ example: '12 Talaat Harb St., Downtown, Cairo' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address: string;
}
