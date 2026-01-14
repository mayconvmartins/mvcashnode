export async function acquireSellLock(
  prisma: any,
  positionId: number,
  jobId: number,
  ttlSeconds = 600,
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const result = await prisma.tradePosition.updateMany({
    where: {
      id: positionId,
      status: 'OPEN',
      qty_remaining: { gt: 0 },
      OR: [
        { sell_lock_job_id: null },
        { sell_lock_expires_at: null },
        { sell_lock_expires_at: { lt: new Date() } },
        { sell_lock_job_id: jobId }, // reentrante (mesmo job)
      ],
    },
    data: {
      sell_lock_job_id: jobId,
      sell_lock_expires_at: expiresAt,
    },
  });

  return result.count > 0;
}

export async function releaseSellLock(
  prisma: any,
  positionId: number,
  jobId: number,
): Promise<boolean> {
  const result = await prisma.tradePosition.updateMany({
    where: {
      id: positionId,
      sell_lock_job_id: jobId,
    },
    data: {
      sell_lock_job_id: null,
      sell_lock_expires_at: null,
    },
  });
  return result.count > 0;
}

