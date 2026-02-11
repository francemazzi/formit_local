import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatAnthropic } from "@langchain/anthropic";
import Anthropic from "@anthropic-ai/sdk";

import {
  initializeDatabase,
  shutdownDatabase,
  getDatabaseClient,
} from "../../src/server/prisma.client";

/**
 * Integration tests for Claude API (Anthropic direct)
 * These tests verify that the CLAUDE_API_KEY environment variable works correctly.
 *
 * Run with: npx vitest run test/integration/claude-api.integration.test.ts
 */
describe("Claude API Integration", () => {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await shutdownDatabase();
  });

  it("should have CLAUDE_API_KEY environment variable set", () => {
    expect(claudeApiKey).toBeDefined();
    expect(claudeApiKey?.length).toBeGreaterThan(0);
    expect(claudeApiKey).toMatch(/^sk-ant-/);
    console.log(`✓ CLAUDE_API_KEY is set (length: ${claudeApiKey?.length})`);
  });

  it("should successfully call Claude API with LangChain ChatAnthropic", async () => {
    if (!claudeApiKey) {
      console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
      return;
    }

    const model = new ChatAnthropic({
      anthropicApiKey: claudeApiKey,
      modelName: "claude-sonnet-4-20250514",
      temperature: 0,
      maxTokens: 100,
    });

    const response = await model.invoke("Rispondi solo con: OK");
    const content = response.content?.toString() ?? "";

    console.log(`✓ LangChain ChatAnthropic response: "${content.trim()}"`);

    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
    expect(content.toLowerCase()).toContain("ok");
  });

  it("should successfully call Claude API with Anthropic SDK directly", async () => {
    if (!claudeApiKey) {
      console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
      return;
    }

    const anthropic = new Anthropic({ apiKey: claudeApiKey });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: "Rispondi solo con la parola: FUNZIONA",
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    console.log(`✓ Anthropic SDK response: "${text.trim()}"`);

    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("funziona");
  });

  it("should be able to store Claude API key in database", async () => {
    if (!claudeApiKey) {
      console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
      return;
    }

    const prisma = getDatabaseClient();

    // Upsert the API key
    const apiKeys = await prisma.apiKey.upsert({
      where: { id: "singleton" },
      update: { claudeApiKey: claudeApiKey },
      create: {
        id: "singleton",
        claudeApiKey: claudeApiKey,
        activeProvider: "ANTHROPIC_CLAUDE",
      },
    });

    expect(apiKeys.claudeApiKey).toBe(claudeApiKey);
    expect(apiKeys.activeProvider).toBe("ANTHROPIC_CLAUDE");

    console.log(`✓ Claude API key stored in database successfully`);

    // Verify we can read it back
    const readBack = await prisma.apiKey.findUnique({
      where: { id: "singleton" },
    });

    expect(readBack?.claudeApiKey).toBe(claudeApiKey);
    console.log(`✓ Claude API key retrieved from database successfully`);
  });

  it("should use Claude via LLM Factory when configured", async () => {
    if (!claudeApiKey) {
      console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
      return;
    }

    const prisma = getDatabaseClient();

    // Ensure Claude is configured and active
    await prisma.apiKey.upsert({
      where: { id: "singleton" },
      update: {
        claudeApiKey: claudeApiKey,
        activeProvider: "ANTHROPIC_CLAUDE",
      },
      create: {
        id: "singleton",
        claudeApiKey: claudeApiKey,
        activeProvider: "ANTHROPIC_CLAUDE",
      },
    });

    // Now test the LLM factory
    const { createLLM } = await import("../../src/server/utils/llm-factory");

    const { model, provider, modelName } = await createLLM({
      capability: "text",
      temperature: 0,
    });

    expect(provider).toBe("anthropic");
    expect(modelName).toBe("claude-sonnet-4-20250514");

    console.log(`✓ LLM Factory created model: ${modelName} (provider: ${provider})`);

    // Make a test call
    const response = await model.invoke("Rispondi solo: TEST_OK");
    const content = response.content?.toString() ?? "";

    console.log(`✓ LLM Factory response: "${content.trim()}"`);

    expect(content.toLowerCase()).toContain("test");
  });
});
