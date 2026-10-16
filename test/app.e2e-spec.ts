import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareTestDatabase } from './helpers';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await prepareTestDatabase();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the app and connects to the test database', async () => {
    const prisma = app.get(PrismaService);
    await expect(prisma.$queryRaw`SELECT 1 AS ok`).resolves.toEqual([
      { ok: 1 },
    ]);
  });
});
