import { PositionService } from '../../positions/position.service';
import { PrismaClient } from '@mvcashnode/db';
import { PositionStatus, TradeJobStatus } from '@mvcashnode/shared';

describe('PositionService', () => {
  let positionService: PositionService;
  let prisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prisma = {
      tradeJob: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tradePosition: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      positionFill: {
        create: jest.fn(),
      },
    } as any;

    positionService = new PositionService(prisma);
  });

  describe('onBuyExecuted', () => {
    it('should create new position on buy execution', async () => {
      const mockJob = {
        id: 1,
        exchange_account_id: 1,
        trade_mode: 'REAL',
        symbol: 'SOL/USDT',
        side: 'BUY',
      };

      prisma.tradeJob.findUnique = jest.fn().mockResolvedValue(mockJob);
      prisma.tradePosition.create = jest.fn().mockResolvedValue({ id: 100 });
      prisma.positionFill.create = jest.fn().mockResolvedValue({});

      await positionService.onBuyExecuted(1, 10, 5.0, 213.45);

      expect(prisma.tradePosition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          exchange_account_id: 1,
          symbol: 'SOL/USDT',
          qty_total: 5.0,
          qty_remaining: 5.0,
          price_open: 213.45,
          status: PositionStatus.OPEN,
        }),
      });
    });
  });

  describe('onSellExecuted', () => {
    it('should close position using FIFO', async () => {
      const mockJob = {
        id: 2,
        exchange_account_id: 1,
        trade_mode: 'REAL',
        symbol: 'SOL/USDT',
        side: 'SELL',
      };

      const mockPositions = [
        {
          id: 100,
          qty_remaining: { toNumber: () => 5.0 },
          price_open: { toNumber: () => 200.0 },
          realized_profit_usd: { toNumber: () => 0 },
        },
      ];

      prisma.tradeJob.findUnique = jest.fn().mockResolvedValue(mockJob);
      prisma.tradePosition.findMany = jest.fn().mockResolvedValue(mockPositions);
      prisma.tradePosition.update = jest.fn().mockResolvedValue({});
      prisma.positionFill.create = jest.fn().mockResolvedValue({});

      await positionService.onSellExecuted(2, 20, 3.0, 220.0, 'WEBHOOK');

      expect(prisma.tradePosition.update).toHaveBeenCalled();
      expect(prisma.positionFill.create).toHaveBeenCalled();
    });
  });
});

