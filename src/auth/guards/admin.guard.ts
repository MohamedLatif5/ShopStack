import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class AdminGuard extends JwtAuthGuard {
  constructor(jwt: JwtService, prisma: PrismaService) {
    super(jwt, prisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Authenticates first: invalid or missing tokens fail with 401
    // before authorization is even considered.
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
