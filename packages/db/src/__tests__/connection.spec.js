"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
describe('Database Connection', () => {
    let prisma;
    beforeAll(() => {
        prisma = new client_1.PrismaClient();
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });
    it('should connect to database', async () => {
        await expect(prisma.$connect()).resolves.not.toThrow();
    });
    it('should execute a simple query', async () => {
        const result = await prisma.$queryRaw `SELECT 1 as value`;
        expect(result).toBeDefined();
    });
});
//# sourceMappingURL=connection.spec.js.map