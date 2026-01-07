import { CustomCheckParameter } from "@prisma/client";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";

import { customCheckService, CategoryWithParameters } from "../../custom-check.service";
import { Analyses } from "../extract_analyses_from_text";
import { RawComplianceResult } from "./index";
import { customCheckPromptTemplate } from "../../prompts/custom_check.prompt";

// ========================================
// Types
// ========================================

type ComplianceBand = "satisfactory" | "acceptable" | "unsatisfactory" | "unknown";

interface ComplianceDecision {
  band: ComplianceBand;
  isCheck: boolean | null;
  appliedLimit: string | null;
  rationale: string;
}

interface CustomCheckInput {
  parameter: string;
  result: string;
  unit: string;
  method: string;
  customParameter: CustomCheckParameter;
  categoryName: string;
  markdownContent: string;
}

// ========================================
// Value Parsing Utilities
// ========================================

const normalizeUnit = (unitText: string): string => {
  return unitText.toLowerCase().replace(/\s+/g, "").replace(/\./g, "").trim();
};

const normalizeLimit = (limitText: string): string => {
  if (!limitText) return limitText;
  return limitText.replace(/\b10([1-9][0-9]*)\b/g, "10^$1");
};

const parseCeirsaNumber = (value: string): number => {
  const trimmed = value.trim().toLowerCase();
  const pow = trimmed.match(/^10\^([0-9])$/);
  if (pow?.[1]) return Math.pow(10, Number(pow[1]));
  return Number(trimmed);
};

const parseMeasuredNumeric = (resultLower: string): number | null => {
  const lt = resultLower.match(/<\s*([0-9]+(?:\.[0-9]+)?)/);
  if (lt?.[1]) return Number(lt[1]);
  const num = resultLower.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (num?.[1]) return Number(num[1]);
  return null;
};

const parseUpperThresholdFromLimit = (limitText: string): number | null => {
  if (!limitText) return null;
  const normalized = normalizeLimit(limitText.toLowerCase());
  const match = normalized.match(/(<|≤)\s*(10\^[0-9]|[0-9]+(?:\.[0-9]+)?)/);
  if (!match?.[2]) return null;
  return parseCeirsaNumber(match[2]);
};

const parseLowerThresholdFromLimit = (limitText: string): number | null => {
  if (!limitText) return null;
  const normalized = normalizeLimit(limitText.toLowerCase());
  const match = normalized.match(/(≥|>=)\s*(10\^[0-9]|[0-9]+(?:\.[0-9]+)?)/);
  if (!match?.[2]) return null;
  return parseCeirsaNumber(match[2]);
};

const parseRangeFromLimit = (
  limitText: string
): { minInclusive: number | null; maxExclusive: number | null } | null => {
  if (!limitText) return null;
  const normalized = normalizeLimit(limitText.toLowerCase());
  const match = normalized.match(
    /(10\^[0-9]|[0-9]+(?:\.[0-9]+)?)\s*≤\s*x\s*<\s*(10\^[0-9]|[0-9]+(?:\.[0-9]+)?)/
  );
  if (!match?.[1] || !match?.[2]) return null;
  return {
    minInclusive: parseCeirsaNumber(match[1]),
    maxExclusive: parseCeirsaNumber(match[2]),
  };
};

// ========================================
// Compliance Decision Logic
// ========================================

const decideCompliance = (input: {
  resultRaw: string;
  measuredUnit: string;
  satisfactoryValue?: string | null;
  acceptableValue?: string | null;
  unsatisfactoryValue?: string | null;
}): ComplianceDecision => {
  const result = (input.resultRaw ?? "").trim().toLowerCase();
  if (!result) {
    return {
      band: "unknown",
      isCheck: null,
      appliedLimit: null,
      rationale: "Risultato mancante/non interpretabile.",
    };
  }

  const sat = input.satisfactoryValue?.trim() ?? "";
  const acc = input.acceptableValue?.trim() ?? "";
  const unsat = input.unsatisfactoryValue?.trim() ?? "";

  const isAbsent =
    result.includes("assente") ||
    result.includes("non rilevato") ||
    result === "nr";
  const isDetected = result.includes("rilevato") || result === "r";

  // Check for absence/presence criteria
  if (sat.toLowerCase().includes("assente") && isDetected) {
    return {
      band: "unsatisfactory",
      isCheck: false,
      appliedLimit: sat,
      rationale: "Il criterio richiede assenza ma il risultato indica rilevazione/presenza.",
    };
  }
  if (sat.toLowerCase().includes("assente") && isAbsent) {
    return {
      band: "satisfactory",
      isCheck: true,
      appliedLimit: sat,
      rationale: "Il criterio richiede assenza e il risultato è assente/NR.",
    };
  }

  // Try to parse numeric value
  const numeric = parseMeasuredNumeric(result);
  if (numeric === null) {
    return {
      band: "unknown",
      isCheck: null,
      appliedLimit: null,
      rationale: "Risultato non numerico e non gestibile con regole semplici.",
    };
  }

  // Three-tier evaluation (satisfactory / acceptable / unsatisfactory)
  if (acc) {
    const satUpper = parseUpperThresholdFromLimit(sat);
    const accRange = parseRangeFromLimit(acc);
    const unsatLower = parseLowerThresholdFromLimit(unsat);

    if (satUpper !== null && numeric < satUpper) {
      return {
        band: "satisfactory",
        isCheck: true,
        appliedLimit: sat,
        rationale: `Valore ${numeric} < soglia soddisfacente ${satUpper}.`,
      };
    }

    if (unsatLower !== null && numeric >= unsatLower) {
      return {
        band: "unsatisfactory",
        isCheck: false,
        appliedLimit: unsat,
        rationale: `Valore ${numeric} ≥ soglia insoddisfacente ${unsatLower}.`,
      };
    }

    if (accRange) {
      const okMin = accRange.minInclusive === null ? true : numeric >= accRange.minInclusive;
      const okMax = accRange.maxExclusive === null ? true : numeric < accRange.maxExclusive;
      if (okMin && okMax) {
        return {
          band: "acceptable",
          isCheck: true,
          appliedLimit: acc,
          rationale: `Valore ${numeric} rientra nel range accettabile.`,
        };
      }
    }
  }

  // Two-tier fallback (satisfactory / unsatisfactory)
  const satUpper = parseUpperThresholdFromLimit(sat);
  const unsatLower = parseLowerThresholdFromLimit(unsat);

  if (satUpper !== null && numeric < satUpper) {
    return {
      band: "satisfactory",
      isCheck: true,
      appliedLimit: sat,
      rationale: `Valore ${numeric} < soglia soddisfacente ${satUpper}.`,
    };
  }
  if (unsatLower !== null && numeric >= unsatLower) {
    return {
      band: "unsatisfactory",
      isCheck: false,
      appliedLimit: unsat,
      rationale: `Valore ${numeric} ≥ soglia insoddisfacente ${unsatLower}.`,
    };
  }

  return {
    band: "unknown",
    isCheck: null,
    appliedLimit: null,
    rationale: "Impossibile classificare in modo deterministico con i limiti disponibili.",
  };
};

// ========================================
// Parameter Matching
// ========================================

const normalizeParameterName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isParameterMatching = (analysisParam: string, customParam: string): boolean => {
  const normalizedAnalysis = normalizeParameterName(analysisParam);
  const normalizedCustom = normalizeParameterName(customParam);

  // Direct match
  if (normalizedAnalysis === normalizedCustom) return true;

  // Substring match with minimum length
  if (
    normalizedAnalysis.includes(normalizedCustom) ||
    normalizedCustom.includes(normalizedAnalysis)
  ) {
    const minLength = Math.min(normalizedAnalysis.length, normalizedCustom.length);
    if (minLength >= 5) return true;
  }

  return false;
};

const findMatchingParameter = (
  analysisParam: string,
  parameters: CustomCheckParameter[]
): CustomCheckParameter | null => {
  return (
    parameters.find((p) => isParameterMatching(analysisParam, p.parameter)) ?? null
  );
};

// ========================================
// LLM-based Compliance Evaluation (fallback)
// ========================================

const promptTemplate = customCheckPromptTemplate;

const defaultParser = new JsonOutputParser<RawComplianceResult[]>();
const defaultModel = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
});

const evaluateWithLLM = async (input: CustomCheckInput): Promise<RawComplianceResult[]> => {
  const decision = decideCompliance({
    resultRaw: input.result,
    measuredUnit: input.unit,
    satisfactoryValue: input.customParameter.satisfactoryValue,
    acceptableValue: input.customParameter.acceptableValue,
    unsatisfactoryValue: input.customParameter.unsatisfactoryValue,
  });

  const formatInstructions = defaultParser.getFormatInstructions();

  const prompt = await promptTemplate.format({
    parameter: input.parameter,
    result: input.result,
    unit: input.unit || "",
    method: input.method || "",
    categoryName: input.categoryName,
    customParameter: input.customParameter.parameter,
    analysisMethod: input.customParameter.analysisMethod || "Non specificato",
    satisfactoryValue: input.customParameter.satisfactoryValue || "Non specificato",
    acceptableValue: input.customParameter.acceptableValue || "Non specificato",
    unsatisfactoryValue: input.customParameter.unsatisfactoryValue || "Non specificato",
    bibliographicReferences: input.customParameter.bibliographicReferences || "",
    notes: input.customParameter.notes || "",
    markdownContent: input.markdownContent,
    autoBand:
      decision.band === "satisfactory"
        ? "soddisfacente"
        : decision.band === "acceptable"
        ? "accettabile"
        : decision.band === "unsatisfactory"
        ? "insoddisfacente"
        : "non determinabile",
    autoIsCheck: decision.isCheck === null ? "null" : decision.isCheck ? "true" : "false",
    autoAppliedLimit: decision.appliedLimit ?? "",
    autoRationale: decision.rationale,
    formatInstructions,
  });

  try {
    const response = await defaultModel.invoke(prompt);
    const rawContent = response.content?.toString() ?? "";
    const parsed = await defaultParser.parse(rawContent);
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch (error) {
    console.warn("[custom.check] LLM evaluation failed:", error);
    return [];
  }
};

// ========================================
// Main Check Function
// ========================================

const checkSingleParameter = async (
  analysis: Analyses,
  customParam: CustomCheckParameter,
  categoryName: string,
  markdownContent: string
): Promise<RawComplianceResult | null> => {
  // First, try deterministic decision
  const decision = decideCompliance({
    resultRaw: analysis.result,
    measuredUnit: analysis.um_result,
    satisfactoryValue: customParam.satisfactoryValue,
    acceptableValue: customParam.acceptableValue,
    unsatisfactoryValue: customParam.unsatisfactoryValue,
  });

  if (decision.isCheck !== null && decision.appliedLimit) {
    return {
      name: customParam.parameter,
      value: decision.appliedLimit,
      isCheck: decision.isCheck,
      description: `Band: ${decision.band}. ${decision.rationale}`,
      sources: [
        {
          id: `custom-${categoryName}-${customParam.parameter}`.replace(/\s+/g, "-").toLowerCase(),
          title: `Limiti personalizzati: ${customParam.parameter}`,
          url: null,
          excerpt: [
            customParam.satisfactoryValue && `Soddisfacente: ${customParam.satisfactoryValue}`,
            customParam.acceptableValue && `Accettabile: ${customParam.acceptableValue}`,
            customParam.unsatisfactoryValue && `Insoddisfacente: ${customParam.unsatisfactoryValue}`,
          ]
            .filter(Boolean)
            .join(" | "),
        },
      ],
    };
  }

  // Fall back to LLM evaluation
  const llmResults = await evaluateWithLLM({
    parameter: analysis.parameter,
    result: analysis.result,
    unit: analysis.um_result,
    method: analysis.method,
    customParameter: customParam,
    categoryName,
    markdownContent,
  });

  return llmResults[0] ?? null;
};

/**
 * Performs compliance check using a custom category defined by the user.
 */
export const customComplianceCheck = async (
  category: CategoryWithParameters,
  analyses: Analyses[],
  markdownContent: string
): Promise<RawComplianceResult[]> => {
  if (!category || !category.parameters || category.parameters.length === 0) {
    console.log(`[custom.check] No parameters in category ${category?.name}`);
    return [];
  }

  if (!analyses || analyses.length === 0) {
    console.log(`[custom.check] No analyses extracted from PDF`);
    return [];
  }

  console.log(`[custom.check] Checking ${analyses.length} analyses against ${category.parameters.length} custom parameters`);
  console.log(`[custom.check] Analyses parameters: ${analyses.map(a => `"${a.parameter}"`).join(", ")}`);
  console.log(`[custom.check] Custom parameters: ${category.parameters.map(p => `"${p.parameter}"`).join(", ")}`);

  const results: RawComplianceResult[] = [];

  for (const analysis of analyses) {
    const matchingParam = findMatchingParameter(analysis.parameter, category.parameters);

    if (matchingParam) {
      console.log(`[custom.check] ✓ Match found: "${analysis.parameter}" → "${matchingParam.parameter}"`);
      const result = await checkSingleParameter(
        analysis,
        matchingParam,
        category.name,
        markdownContent
      );

      if (result) {
        results.push(result);
      }
    } else {
      console.log(`[custom.check] ✗ No match for: "${analysis.parameter}"`);
    }
  }

  console.log(`[custom.check] Total results: ${results.length}`);
  return results;
};

/**
 * Finds matching custom category by ID and performs compliance check.
 */
export const customCheck = async (
  categoryId: string,
  analyses: Analyses[],
  markdownContent: string
): Promise<RawComplianceResult[]> => {
  const category = await customCheckService.getCategoryById(categoryId);
  
  if (!category) {
    console.warn(`[custom.check] Category not found: ${categoryId}`);
    return [];
  }

  return customComplianceCheck(category, analyses, markdownContent);
};

export { findMatchingParameter, isParameterMatching, decideCompliance };

