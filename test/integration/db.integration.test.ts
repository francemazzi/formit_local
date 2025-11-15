import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from "../../src/server/db.service";

describe("Database integration", () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await shutdownDatabase();
  });

  it("should establish a Prisma connection and run a basic query", async () => {
    const client = getDatabaseClient();
    const rows = await client.$queryRaw<Array<{ value: bigint }>>`
      SELECT 1 as value
    `;

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.at(0)?.value).toBe(1n);
  });
});
