import { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;

const ensureClient = (): PrismaClient => {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }

  return prismaClient;
};

export const initializeDatabase = async (): Promise<void> => {
  const client = ensureClient();
  await client.$connect();
};

export const shutdownDatabase = async (): Promise<void> => {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
};

export const getDatabaseClient = (): PrismaClient => {
  return ensureClient();
};
