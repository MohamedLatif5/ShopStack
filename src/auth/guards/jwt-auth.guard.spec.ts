import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let verifyAsync: jest.Mock;
  let findUnique: jest.Mock;
  let request: AuthenticatedRequest;

  const buildContext = () =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const expectUnauthorized = async (message: string) => {
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(buildContext())).rejects.toThrow(message);
  };

  beforeEach(() => {
    verifyAsync = jest.fn();
    findUnique = jest.fn();
    const jwt = { verifyAsync } as unknown as JwtService;
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    guard = new JwtAuthGuard(jwt, prisma);
    request = { headers: {} } as AuthenticatedRequest;
  });

  it('rejects a request without an authorization header', async () => {
    await expectUnauthorized('Missing or malformed authorization header');
  });

  it('rejects a non-Bearer authorization header', async () => {
    request.headers.authorization = 'Basic somecredentials';

    await expectUnauthorized('Missing or malformed authorization header');
  });

  it('rejects a token that fails verification', async () => {
    request.headers.authorization = 'Bearer not.a.jwt';
    verifyAsync.mockRejectedValue(new Error('jwt malformed'));

    await expectUnauthorized('Invalid or expired token');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a valid token whose user no longer exists', async () => {
    request.headers.authorization = 'Bearer valid-token';
    verifyAsync.mockResolvedValue({ sub: 9, role: 'CUSTOMER' });
    findUnique.mockResolvedValue(null);

    await expectUnauthorized('Invalid or expired token');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 9 },
      select: { id: true, role: true },
    });
  });

  it('authenticates and stores the database role, not the token role', async () => {
    request.headers.authorization = 'Bearer valid-token';
    verifyAsync.mockResolvedValue({ sub: 9, role: 'ADMIN' });
    findUnique.mockResolvedValue({ id: 9, role: 'CUSTOMER' });

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);

    expect(request.user).toEqual({ userId: 9, role: 'CUSTOMER' });
  });
});
