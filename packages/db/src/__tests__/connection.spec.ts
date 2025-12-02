import { PrismaClient } from '@prisma/client';

describe('Database Connection', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should connect to database', async () => {
    await expect(prisma.$connect()).resolves.not.toThrow();
  });

  it('should execute a simple query', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as value`;
    expect(result).toBeDefined();
  });
});

