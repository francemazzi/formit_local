import "dotenv/config";
import { describe, expect, it, vi } from "vitest";

import { beverageCheck } from "../../src/server/modules/checks/beverage.check";
import { ComplianceResult } from "../../src/server/modules/checks";
import { BeverageCheckInput } from "../../src/server/modules/checks/beverage.check";

const requireEnv = () => {
  if (!process.env.OPENAI_API_KEY || !process.env.TAVILY_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY e TAVILY_API_KEY devono essere impostate per eseguire il test reale."
    );
  }
};

describe("Beverage check (real tools)", () => {
  vi.setConfig({ testTimeout: 180_000 }); // fino a 3 minuti per query+LLM reali

  it("esegue una verifica reale usando Tavily + OpenAI", async () => {
    requireEnv();

    const input: BeverageCheckInput = {
      parameter: "Escherichia coli",
      value: "2",
      unit: "UFC/100 ml",
      beverageType: "acqua potabile",
      markdownContent:
        "Rapporto di prova su campione di acqua potabile. Analisi microbiologiche incluse: E. coli, enterococchi intestinali.",
    };

    const result = await beverageCheck(input);

    expect(Array.isArray(result.ragResults)).toBe(true);
    expect(result.ragResults.length).toBeGreaterThan(0); // deve trovare almeno un riferimento normativo
    expect(result.combinedAssessment).toEqual(result.ragResults);

    const item: ComplianceResult = result.ragResults[0];
    expect(typeof item.name).toBe("string");
    expect(typeof item.value).toBe("string");
    expect(typeof item.isCheck).toBe("boolean");
    expect(typeof item.description).toBe("string");
  });
});
