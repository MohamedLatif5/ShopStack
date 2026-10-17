import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareTestDatabase } from './helpers';

interface RegisterResponse {
  id: number;
  email: string;
  fullName: string | null;
  role: string;
}

describe('Auth register (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const payload = {
    email: 'customer@shopstack.dev',
    password: 'correct-horse-battery',
    fullName: 'E2E Customer',
  };

  beforeAll(async () => {
    await prepareTestDatabase();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('registers a customer and returns only public fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);
    const body = res.body as RegisterResponse;

    expect(body.email).toBe(payload.email);
    expect(body.fullName).toBe(payload.fullName);
    expect(body.role).toBe('CUSTOMER');
    expect(typeof body.id).toBe('number');
    expect(Object.keys(body).sort()).toEqual([
      'email',
      'fullName',
      'id',
      'role',
    ]);

    const stored = await prisma.user.findUnique({
      where: { email: payload.email },
    });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe(payload.password);
    expect(stored?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('registers without the optional full name', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'noname@shopstack.dev',
        password: 'correct-horse-battery',
      })
      .expect(201);
    const body = res.body as RegisterResponse;

    expect(body.fullName).toBeNull();
    expect(body.role).toBe('CUSTOMER');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...payload, fullName: 'Someone Else' })
      .expect(409);

    expect((res.body as { error: string }).error).toBe('Conflict');
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...payload, email: 'not-an-email' })
      .expect(400);

    expect((res.body as { error: string }).error).toBe('Bad Request');
  });

  it('rejects a password shorter than 8 characters with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...payload, password: 'short' })
      .expect(400);

    expect((res.body as { error: string }).error).toBe('Bad Request');
  });

  it('rejects a non-string password with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...payload, password: 12345678 })
      .expect(400);

    expect((res.body as { error: string }).error).toBe('Bad Request');
  });

  it('rejects attempts to set the role through the request body', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...payload, role: 'ADMIN' })
      .expect(400);

    expect((res.body as { error: string }).error).toBe('Bad Request');
  });
});
