import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'customer@shopstack.dev' })
  email: string;

  @ApiProperty({ example: 'E2E Customer', nullable: true })
  fullName: string | null;

  @ApiProperty({ enum: Role, example: Role.CUSTOMER })
  role: Role;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT bearer token, valid for 7 days',
  })
  accessToken: string;
}
