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

