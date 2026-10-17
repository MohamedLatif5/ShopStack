import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS, AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

const hashMock = bcrypt.hash as unknown as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let create: jest.Mock;

  const dto = {
    email: 'customer@shopstack.dev',
    password: 'plain-password',
    fullName: 'E2E Customer',
  };

  beforeEach(() => {
    create = jest.fn();
    const prisma = { user: { create } } as unknown as PrismaService;
    service = new AuthService(prisma);
    hashMock.mockReset();
    hashMock.mockResolvedValue('hashed-password');
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
});
