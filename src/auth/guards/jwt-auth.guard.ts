import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthenticatedUser {
  userId: number;
  role: Role;
}

export type AuthenticatedRequest = import('express').Request & {
  user: AuthenticatedUser;
};

interface TokenPayload {
  sub: number;
  role: Role;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed authorization header',
      );
    }

    const token = header.slice('Bearer '.length).trim();

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The database role is authoritative: a stale token cannot grant a
    // role the account no longer has.
    request.user = { userId: user.id, role: user.role };
    return true;
  }
}
