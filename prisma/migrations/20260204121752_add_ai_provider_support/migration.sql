-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tavilyApiKey" TEXT,
    "openaiApiKey" TEXT,
    "awsAccessKeyId" TEXT,
    "awsSecretAccessKey" TEXT,
    "awsRegion" TEXT,
    "activeProvider" TEXT NOT NULL DEFAULT 'OPENAI'
);
INSERT INTO "new_ApiKey" ("createdAt", "id", "openaiApiKey", "tavilyApiKey", "updatedAt") SELECT "createdAt", "id", "openaiApiKey", "tavilyApiKey", "updatedAt" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
