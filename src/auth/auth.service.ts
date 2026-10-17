import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

export const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: number;
  email: string;
  fullName: string | null;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: { email: dto.email, passwordHash, fullName: dto.fullName },
        select: { id: true, email: true, fullName: true, role: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }
}
