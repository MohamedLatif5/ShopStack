import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS, AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const hashMock = bcrypt.hash as unknown as jest.Mock;
const compareMock = bcrypt.compare as unknown as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let create: jest.Mock;
  let findUnique: jest.Mock;
  let signAsync: jest.Mock;

  const dto = {
    email: 'customer@shopstack.dev',
    password: 'plain-password',
    fullName: 'E2E Customer',
  };

  beforeEach(() => {
    create = jest.fn();
    findUnique = jest.fn();
    signAsync = jest.fn();
    const prisma = { user: { create, findUnique } } as unknown as PrismaService;
    const jwt = { signAsync } as unknown as JwtService;
    service = new AuthService(prisma, jwt);
    hashMock.mockReset();
    hashMock.mockResolvedValue('hashed-password');
    compareMock.mockReset();
    signAsync.mockReset();
  });

  it('hashes the password with bcrypt cost 12 before creating the user', async () => {
    create.mockResolvedValue({
      id: 1,
      email: dto.email,
      fullName: dto.fullName,
      role: 'CUSTOMER',
    });

    await service.register(dto);

    expect(hashMock).toHaveBeenCalledWith(dto.password, BCRYPT_ROUNDS);
    expect(create).toHaveBeenCalledWith({
      data: {
        email: dto.email,
        passwordHash: 'hashed-password',
        fullName: dto.fullName,
      },
      select: { id: true, email: true, fullName: true, role: true },
    });
  });

  it('returns the created user with only public fields', async () => {
    const created = {
      id: 1,
      email: dto.email,
      fullName: dto.fullName,
      role: 'CUSTOMER',
    };
    create.mockResolvedValue(created);

    const result = await service.register(dto);

    expect(result).toEqual(created);
  });

  it('maps a duplicate email (P2002) to a ConflictException', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['User_email_key'] },
        },
      ),
    );

    await expect(service.register(dto)).rejects.toThrow(ConflictException);
  });

  it('rethrows unexpected database errors unchanged', async () => {
    const boom = new Error('unexpected database failure');
    create.mockRejectedValue(boom);

    await expect(service.register(dto)).rejects.toBe(boom);
  });

  describe('login', () => {
    const loginDto = { email: dto.email, password: dto.password };
    const storedUser = {
      id: 7,
      email: dto.email,
      passwordHash: 'stored-hash',
      role: 'CUSTOMER',
    };

    it('issues a signed access token for valid credentials', async () => {
      findUnique.mockResolvedValue(storedUser);
      compareMock.mockResolvedValue(true);
      signAsync.mockResolvedValue('signed-token');

      const result = await service.login(loginDto);

      expect(compareMock).toHaveBeenCalledWith(dto.password, 'stored-hash');
      expect(signAsync).toHaveBeenCalledWith({ sub: 7, role: 'CUSTOMER' });
      expect(result).toEqual({ accessToken: 'signed-token' });
    });

    it('rejects a wrong password with Unauthorized', async () => {
      findUnique.mockResolvedValue(storedUser);
      compareMock.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid email or password',
      );
      expect(signAsync).not.toHaveBeenCalled();
    });

    it('rejects an unknown email without comparing or leaking enumeration', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid email or password',
      );
      expect(compareMock).not.toHaveBeenCalled();
      expect(signAsync).not.toHaveBeenCalled();
    });
  });
});
