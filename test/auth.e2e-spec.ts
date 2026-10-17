import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

interface LoginResponse {
  accessToken: string;
}

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

interface TokenPayload {
  sub: number;
  role: string;
  iat: number;
  exp: number;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const payload = {
    email: 'customer@shopstack.dev',
    password: 'correct-horse-battery',
    fullName: 'E2E Customer',
  };

  const registerCustomer = () =>
    request(app.getHttpServer()).post('/auth/register').send(payload);

  const loginCustomer = (credentials: { email: string; password: string }) =>
    request(app.getHttpServer()).post('/auth/login').send(credentials);

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

  describe('register', () => {
    it('registers a customer and returns only public fields', async () => {
      const res = await registerCustomer().expect(201);
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
      await registerCustomer().expect(201);

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

  describe('login', () => {
    it('returns a signed access token for valid credentials', async () => {
      await registerCustomer().expect(201);

      const res = await loginCustomer({
        email: payload.email,
        password: payload.password,
      }).expect(200);
      const body = res.body as LoginResponse;

      expect(typeof body.accessToken).toBe('string');
      const parts = body.accessToken.split('.');
      expect(parts).toHaveLength(3);

      const tokenPayload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8'),
      ) as TokenPayload;
      expect(tokenPayload.sub).toBeGreaterThan(0);
      expect(tokenPayload.role).toBe('CUSTOMER');
      expect(tokenPayload.exp).toBeGreaterThan(tokenPayload.iat);
    });

    it('rejects a wrong password with 401', async () => {
      await registerCustomer().expect(201);

      const res = await loginCustomer({
        email: payload.email,
        password: 'totally-wrong-pass',
      }).expect(401);
      const body = res.body as ErrorResponse;

      expect(body.statusCode).toBe(401);
      expect(body.message).toBe('Invalid email or password');
    });

    it('gives an unknown email the same 401 as a wrong password', async () => {
      await registerCustomer().expect(201);

      const wrongPassword = await loginCustomer({
        email: payload.email,
        password: 'totally-wrong-pass',
      });
      const unknownEmail = await loginCustomer({
        email: 'ghost@shopstack.dev',
        password: 'totally-wrong-pass',
      });

      const wrongPasswordBody = wrongPassword.body as ErrorResponse;
      const unknownEmailBody = unknownEmail.body as ErrorResponse;

      expect(unknownEmailBody.statusCode).toBe(401);
      expect(unknownEmailBody.message).toBe(wrongPasswordBody.message);
    });

    it('rejects a login without a password with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email })
        .expect(400);

      expect((res.body as { error: string }).error).toBe('Bad Request');
    });
  });

  describe('me', () => {
    const registerAndLogin = async () => {
      const registerRes = await registerCustomer().expect(201);
      const loginRes = await loginCustomer({
        email: payload.email,
        password: payload.password,
      }).expect(200);

      return {
        id: (registerRes.body as RegisterResponse).id,
        accessToken: (loginRes.body as LoginResponse).accessToken,
      };
    };

    const getMe = (token?: string) => {
      const req = request(app.getHttpServer()).get('/auth/me');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('returns the current customer for a valid token', async () => {
      const { id, accessToken } = await registerAndLogin();

      const res = await getMe(accessToken).expect(200);
      const body = res.body as RegisterResponse;

      expect(body.id).toBe(id);
      expect(body.email).toBe(payload.email);
      expect(body.role).toBe('CUSTOMER');
      expect(Object.keys(body).sort()).toEqual([
        'email',
        'fullName',
        'id',
        'role',
      ]);
    });

    it('rejects a request without a token', async () => {
      const res = await getMe().expect(401);

      expect((res.body as { statusCode: number }).statusCode).toBe(401);
      expect((res.body as { error: string }).error).toBe('Unauthorized');
    });

    it('rejects a malformed token', async () => {
      await getMe('not.a.jwt').expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const { id } = await registerAndLogin();
      const forged = app
        .get(JwtService)
        .sign({ sub: id, role: 'CUSTOMER' }, { secret: 'wrong-secret' });

      await getMe(forged).expect(401);
    });

    it('rejects a token whose user was deleted', async () => {
      const { id, accessToken } = await registerAndLogin();
      await prisma.user.delete({ where: { id } });

      await getMe(accessToken).expect(401);
    });
  });
});
