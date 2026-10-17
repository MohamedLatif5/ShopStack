import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let verifyAsync: jest.Mock;
  let findUnique: jest.Mock;
  let request: AuthenticatedRequest;

  const buildContext = () =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    verifyAsync = jest.fn();
    findUnique = jest.fn();
    const jwt = { verifyAsync } as unknown as JwtService;
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    guard = new AdminGuard(jwt, prisma);
    request = { headers: {} } as AuthenticatedRequest;
  });

  it('allows an authenticated admin through', async () => {
    request.headers.authorization = 'Bearer valid-token';
    verifyAsync.mockResolvedValue({ sub: 1, role: 'ADMIN' });
    findUnique.mockResolvedValue({ id: 1, role: 'ADMIN' });

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 1, role: 'ADMIN' });
  });

  it('rejects a customer with Forbidden even if the token claims admin', async () => {
    request.headers.authorization = 'Bearer valid-token';
    verifyAsync.mockResolvedValue({ sub: 2, role: 'ADMIN' });
    findUnique.mockResolvedValue({ id: 2, role: 'CUSTOMER' });

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      'Admin access required',
    );
  });

  it('still rejects unauthenticated requests with Unauthorized', async () => {
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      'Missing or malformed authorization header',
    );
  });

  it('rejects a valid token whose user was deleted', async () => {
    request.headers.authorization = 'Bearer valid-token';
    verifyAsync.mockResolvedValue({ sub: 3, role: 'ADMIN' });
    findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      'Invalid or expired token',
    );
  });
});
