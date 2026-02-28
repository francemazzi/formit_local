-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tavilyApiKey" TEXT,
    "openaiApiKey" TEXT,
    "claudeApiKey" TEXT,
    "awsAccessKeyId" TEXT,
    "awsSecretAccessKey" TEXT,
    "awsRegion" TEXT,
    "ollamaBaseUrl" TEXT,
    "ollamaModel" TEXT,
    "activeProvider" TEXT NOT NULL DEFAULT 'OLLAMA'
);
INSERT INTO "new_ApiKey" ("activeProvider", "awsAccessKeyId", "awsRegion", "awsSecretAccessKey", "claudeApiKey", "createdAt", "id", "openaiApiKey", "tavilyApiKey", "updatedAt") SELECT "activeProvider", "awsAccessKeyId", "awsRegion", "awsSecretAccessKey", "claudeApiKey", "createdAt", "id", "openaiApiKey", "tavilyApiKey", "updatedAt" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
