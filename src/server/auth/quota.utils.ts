import { getDatabaseClient } from "../prisma.client";

export const PLAN_QUOTAS: Record<string, number> = {
  FREE: 10,
  PRO: 50,
  ENTERPRISE: 100,
};

export interface QuotaInfo {
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  allowed: boolean;
}

export const checkUserQuota = async (
  userId: string,
  plan: string
): Promise<QuotaInfo> => {
  const client = getDatabaseClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const uploadCount = await client.pdfExtraction.count({
    where: {
      userId,
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  const limit = PLAN_QUOTAS[plan] || PLAN_QUOTAS.FREE!;

  return {
    plan,
    limit,
    used: uploadCount,
    remaining: Math.max(0, limit - uploadCount),
    allowed: uploadCount < limit,
  };
};

export const canUploadFiles = async (
  userId: string,
  plan: string,
  fileCount: number
): Promise<QuotaInfo> => {
  const quota = await checkUserQuota(userId, plan);

  return {
    ...quota,
    allowed: quota.used + fileCount <= quota.limit,
  };
};
