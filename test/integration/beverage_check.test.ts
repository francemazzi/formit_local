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

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0); // deve trovare almeno un riferimento normativo

    const item: ComplianceResult = result[0];
    expect(typeof item.name).toBe("string");
    expect(typeof item.value).toBe("string");
    expect(typeof item.isCheck).toBe("boolean");
    expect(typeof item.description).toBe("string");
    expect(Array.isArray(item.sources)).toBe(true);

    // Stampa i risultati per verifica
    console.log("\n=== RISULTATI BEVERAGE CHECK ===");
    console.log(`Trovati ${result.length} check di conformità:\n`);
    result.forEach((check, index) => {
      console.log(`Check ${index + 1}:`);
      console.log(`  Nome: ${check.name}`);
      console.log(`  Valore: ${check.value}`);
      console.log(`  Conforme: ${check.isCheck ? "SÌ" : "NO"}`);
      console.log(`  Descrizione: ${check.description}`);
      console.log(`  Fonti (${check.sources.length}):`);
      check.sources.forEach((source, sIndex) => {
        console.log(`    Fonte ${sIndex + 1}:`);
        console.log(`      ID: ${source.id}`);
        console.log(`      Titolo: ${source.title}`);
        console.log(`      URL: ${source.url || "N/A"}`);
        console.log(`      Estratto: ${source.excerpt.substring(0, 100)}...`);
      });
      console.log("");
    });
  });
});
