import "dotenv/config";
import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from "./server/prisma.client";

interface ApplicationContract {
  bootstrap(): Promise<void>;
  shutdown(): Promise<void>;
}

const createApplication = (
  bootstrapDatabase: () => Promise<void>,
  disposeDatabase: () => Promise<void>
): ApplicationContract => {
  return {
    async bootstrap(): Promise<void> {
      await bootstrapDatabase();
      const datasourceUrl = process.env.DATABASE_URL ?? "file:./dev.db";
      console.log(`Prisma is configured to use SQLite at ${datasourceUrl}`);
    },
    async shutdown(): Promise<void> {
      await disposeDatabase();
    },
  };
};

const application = createApplication(initializeDatabase, shutdownDatabase);

const run = async (): Promise<void> => {
  try {
    await application.bootstrap();
    getDatabaseClient();
    console.log("Database client ready.");
    await application.shutdown();
    process.exit(0);
  } catch (error) {
    console.error("Unable to start the application", error);
    await application.shutdown();
    process.exit(1);
  }
};

void run();
