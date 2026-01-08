import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";

import {
  getCeirsaCategories,
  type CeirsaCategory,
} from "../ceirsa_categorizer";
import { MatrixExtractionResult } from "../extract_matrix_from_text";
import { Analyses } from "../extract_analyses_from_text";
import { RawComplianceResult } from "./index";
import {
  ceirsaCompliancePromptTemplate,
  ceirsaParameterEquivalencePrompt,
  ceirsaComplianceDecisionPrompt,
} from "../../prompts/ceirsa_check.prompts";

interface CeirsaCategoryProvider {
  loadAll(): Promise<CeirsaCategory[]>;
}

const createFileSystemCeirsaCategoryProvider = (): CeirsaCategoryProvider => ({
  loadAll: () => getCeirsaCategories(),
});

const normalizeValue = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

const createCeirsaCategoryMatcher = (provider: CeirsaCategoryProvider) => {
  const isMatchingCategory = (
    target: string,
    category: CeirsaCategory
  ): boolean => {
    const normalizedName = normalizeValue(category.name);
    const normalizedId = normalizeValue(category.id);
    return normalizedName === target || normalizedId === target;
  };

  const findByMatrix = async (
    matrix: MatrixExtractionResult
  ): Promise<CeirsaCategory | null> => {
    const normalizedTarget = normalizeValue(matrix.ceirsa_category);
    if (!normalizedTarget) return null;

    const categories = await provider.loadAll();
    return (
      categories.find((category) =>
        isMatchingCategory(normalizedTarget, category)
      ) ?? null
    );
  };

  return { findByMatrix };
};

const categoryMatcher = createCeirsaCategoryMatcher(
  createFileSystemCeirsaCategoryProvider()
);

export const ceirsaCheck = async (
  matrix: MatrixExtractionResult
): Promise<CeirsaCategory | null> => {
  return categoryMatcher.findByMatrix(matrix);
};

export interface CeirsaCheckInput {
  parameter: string;
  result: string;
  unit: string;
  method: string;
  ceirsaParameter: string;
  satisfactoryValue?: string;
  acceptableValue?: string;
  unsatisfactoryValue?: string;
  microbiologicalCriterion?: string;
  analysisMethod?: string;
  bibliographicReferences?: string;
  notes?: string;
  categoryName: string;
  categoryId: string;
  markdownContent: string;
}

type CeirsaBand = "satisfactory" | "acceptable" | "unsatisfactory" | "unknown";

interface CeirsaDecision {
  band: CeirsaBand;
  isCheck: boolean | null;
  appliedLimit: string | null;
  rationale: string;
}

interface ComplianceDecisionInput {
  resultRaw: string;
  measuredUnit: string;
  satisfactoryValue?: string;
  acceptableValue?: string;
  unsatisfactoryValue?: string;
}

/**
 * Cache for compliance decision results to avoid redundant LLM calls.
 */
const complianceDecisionCache = new Map<string, CeirsaDecision>();

const buildComplianceDecisionCacheKey = (
  input: ComplianceDecisionInput
): string => {
  return `${input.resultRaw}::${input.measuredUnit}::${
    input.satisfactoryValue ?? ""
  }::${input.acceptableValue ?? ""}::${input.unsatisfactoryValue ?? ""}`;
};

/**
 * Uses LLM to determine compliance decision.
 * Handles unit compatibility checks, numeric parsing, and threshold comparison.
 */
const decideComplianceWithLLM = async (
  input: ComplianceDecisionInput
): Promise<CeirsaDecision> => {
  const cacheKey = buildComplianceDecisionCacheKey(input);

  if (complianceDecisionCache.has(cacheKey)) {
    return complianceDecisionCache.get(cacheKey)!;
  }

  const result = (input.resultRaw ?? "").trim();
  if (!result) {
    return {
      band: "unknown",
      isCheck: null,
      appliedLimit: null,
      rationale: "Risultato mancante/non interpretabile.",
    };
  }

  try {
    const decisionModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const prompt = ceirsaComplianceDecisionPrompt
      .replace("{measuredResult}", input.resultRaw)
      .replace("{measuredUnit}", input.measuredUnit || "non specificata")
      .replace(
        "{satisfactoryValue}",
        input.satisfactoryValue || "non specificato"
      )
      .replace("{acceptableValue}", input.acceptableValue || "non specificato")
      .replace(
        "{unsatisfactoryValue}",
        input.unsatisfactoryValue || "non specificato"
      );

    const response = await decisionModel.invoke(prompt);
    const rawContent = response.content?.toString().trim() ?? "";

    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        "LLM compliance decision returned invalid JSON:",
        rawContent
      );
      return {
        band: "unknown",
        isCheck: null,
        appliedLimit: null,
        rationale: "Errore nel parsing della risposta LLM.",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as CeirsaDecision;

    const decision: CeirsaDecision = {
      band: parsed.band || "unknown",
      isCheck: parsed.isCheck ?? null,
      appliedLimit: parsed.appliedLimit ?? null,
      rationale: parsed.rationale || "Nessuna motivazione fornita.",
    };

    complianceDecisionCache.set(cacheKey, decision);
    return decision;
  } catch (error) {
    console.warn("LLM compliance decision failed:", error);
    return {
      band: "unknown",
      isCheck: null,
      appliedLimit: null,
      rationale: "Errore durante la valutazione di conformità.",
    };
  }
};

const normalizeParameterName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Cache for parameter matching results to avoid redundant LLM calls.
 */
const parameterMatchCache = new Map<string, boolean>();

const buildMatchCacheKey = (
  analysisParam: string,
  ceirsaParam: string
): string => {
  return `${normalizeParameterName(analysisParam)}::${normalizeParameterName(
    ceirsaParam
  )}`;
};

/**
 * Uses LLM to determine if two microbiological parameters are semantically equivalent.
 */
const checkParameterEquivalenceWithLLM = async (
  analysisParam: string,
  ceirsaParam: string
): Promise<boolean> => {
  const cacheKey = buildMatchCacheKey(analysisParam, ceirsaParam);

  if (parameterMatchCache.has(cacheKey)) {
    return parameterMatchCache.get(cacheKey)!;
  }

  try {
    const matcherModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const prompt = ceirsaParameterEquivalencePrompt
      .replace("{analysisParam}", analysisParam)
      .replace("{ceirsaParam}", ceirsaParam);

    const response = await matcherModel.invoke(prompt);
    const result = response.content?.toString().trim().toLowerCase() === "true";

    parameterMatchCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("LLM parameter matching failed:", error);
    return false;
  }
};

/**
 * Checks if an analysis parameter matches a CEIRSA parameter.
 * Uses simple string matching first, then falls back to LLM for semantic matching.
 */
const isParameterMatching = (
  analysisParam: string,
  ceirsaParam: string
): boolean => {
  const normalizedAnalysis = normalizeParameterName(analysisParam);
  const normalizedCeirsa = normalizeParameterName(ceirsaParam);

  // Direct match
  if (normalizedAnalysis === normalizedCeirsa) return true;

  // Substring match with minimum length
  if (
    normalizedAnalysis.includes(normalizedCeirsa) ||
    normalizedCeirsa.includes(normalizedAnalysis)
  ) {
    const minLength = Math.min(
      normalizedAnalysis.length,
      normalizedCeirsa.length
    );
    if (minLength >= 10) return true;
  }

  return false;
};

/**
 * Async version that includes LLM-based semantic matching.
 */
const isParameterMatchingAsync = async (
  analysisParam: string,
  ceirsaParam: string
): Promise<boolean> => {
  // First try simple matching
  if (isParameterMatching(analysisParam, ceirsaParam)) {
    return true;
  }

  // Fall back to LLM for semantic matching
  return checkParameterEquivalenceWithLLM(analysisParam, ceirsaParam);
};

const buildPrompt = async (
  input: CeirsaCheckInput,
  template: PromptTemplate,
  formatInstructions: string
): Promise<string> => {
  const ceirsaLimits = [
    input.satisfactoryValue && `Soddisfacente: ${input.satisfactoryValue}`,
    input.acceptableValue && `Accettabile: ${input.acceptableValue}`,
    input.unsatisfactoryValue &&
      `Insoddisfacente: ${input.unsatisfactoryValue}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Get compliance decision from LLM
  const decision = await decideComplianceWithLLM({
    resultRaw: input.result,
    measuredUnit: input.unit,
    ...(input.satisfactoryValue
      ? { satisfactoryValue: input.satisfactoryValue }
      : {}),
    ...(input.acceptableValue
      ? { acceptableValue: input.acceptableValue }
      : {}),
    ...(input.unsatisfactoryValue
      ? { unsatisfactoryValue: input.unsatisfactoryValue }
      : {}),
  });

  return template.format({
    parameter: input.parameter,
    result: input.result,
    unit: input.unit || "",
    method: input.method || "",
    ceirsaParameter: input.ceirsaParameter,
    ceirsaLimits: ceirsaLimits || "Nessun limite specificato",
    normalizedCeirsaLimits: ceirsaLimits || "Nessun limite specificato",
    autoBand:
      decision.band === "satisfactory"
        ? "soddisfacente"
        : decision.band === "acceptable"
        ? "accettabile"
        : decision.band === "unsatisfactory"
        ? "insoddisfacente"
        : "non determinabile",
    autoIsCheck:
      decision.isCheck === null ? "null" : decision.isCheck ? "true" : "false",
    autoAppliedLimit: decision.appliedLimit ?? "",
    autoRationale: decision.rationale,
    microbiologicalCriterion:
      input.microbiologicalCriterion || "Non specificato",
    analysisMethod: input.analysisMethod || "Non specificato",
    bibliographicReferences: input.bibliographicReferences || "",
    notes: input.notes || "",
    categoryName: input.categoryName,
    categoryId: input.categoryId,
    markdownContent: input.markdownContent,
    formatInstructions,
  });
};

const evaluateCompliance = async (
  prompt: string,
  model: ChatOpenAI,
  parser: JsonOutputParser<RawComplianceResult[]>
): Promise<RawComplianceResult[]> => {
  try {
    const response = await model.invoke(prompt);
    const rawContent = response.content?.toString() ?? "";
    const parsed = await parser.parse(rawContent);
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch (error) {
    console.warn("CEIRSA compliance evaluation failed:", error);
    return [];
  }
};

const checkCompliance = async (
  input: CeirsaCheckInput,
  template: PromptTemplate,
  formatInstructions: string,
  model: ChatOpenAI,
  parser: JsonOutputParser<RawComplianceResult[]>
): Promise<RawComplianceResult[]> => {
  const prompt = await buildPrompt(input, template, formatInstructions);
  const results = await evaluateCompliance(prompt, model, parser);
  const normalizedResults = Array.isArray(results) ? results : [];

  // Get compliance decision from LLM
  const decision = await decideComplianceWithLLM({
    resultRaw: input.result,
    measuredUnit: input.unit,
    ...(input.satisfactoryValue
      ? { satisfactoryValue: input.satisfactoryValue }
      : {}),
    ...(input.acceptableValue
      ? { acceptableValue: input.acceptableValue }
      : {}),
    ...(input.unsatisfactoryValue
      ? { unsatisfactoryValue: input.unsatisfactoryValue }
      : {}),
  });

  if (decision.isCheck !== null && decision.appliedLimit) {
    const base: RawComplianceResult =
      normalizedResults[0] ??
      ({
        name: input.ceirsaParameter,
        value: decision.appliedLimit,
        isCheck: decision.isCheck,
        description: "",
        sources: [],
      } satisfies RawComplianceResult);

    const enforced: RawComplianceResult = {
      ...base,
      name: input.ceirsaParameter,
      value: decision.appliedLimit,
      isCheck: decision.isCheck,
      description:
        base.description?.trim().length > 0
          ? base.description
          : `Band: ${decision.band}. ${decision.rationale}`,
      sources: Array.isArray(base.sources) ? base.sources : [],
    };

    return [enforced];
  }

  return normalizedResults.map((result) => ({
    ...result,
    sources: Array.isArray(result.sources) ? result.sources : [],
  }));
};

const promptTemplate = ceirsaCompliancePromptTemplate;

const defaultParser = new JsonOutputParser<RawComplianceResult[]>();
const defaultModel = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
});

/**
 * Finds the matching CEIRSA parameter for an analysis parameter.
 * Uses async LLM-based matching if simple matching fails.
 */
const findMatchingCeirsaParameter = async (
  analysisParam: string,
  categoryData: any[]
): Promise<any | null> => {
  // First try simple synchronous matching
  const simpleMatch = categoryData.find(
    (param: any) =>
      param.parameter && isParameterMatching(analysisParam, param.parameter)
  );

  if (simpleMatch) {
    return simpleMatch;
  }

  // Fall back to async LLM matching
  for (const param of categoryData) {
    if (param.parameter) {
      const isMatch = await isParameterMatchingAsync(
        analysisParam,
        param.parameter
      );
      if (isMatch) {
        return param;
      }
    }
  }

  return null;
};

export const ceirsaComplianceCheck = async (
  category: CeirsaCategory,
  analyses: Analyses[],
  markdownContent: string
): Promise<RawComplianceResult[]> => {
  if (!category || !category.data || !Array.isArray(category.data)) {
    return [];
  }

  if (!analyses || analyses.length === 0) {
    return [];
  }

  const results: RawComplianceResult[] = [];
  const formatInstructions = defaultParser.getFormatInstructions();

  for (const analysis of analyses) {
    const matchingParameter = await findMatchingCeirsaParameter(
      analysis.parameter,
      category.data
    );

    if (matchingParameter) {
      const input: CeirsaCheckInput = {
        parameter: analysis.parameter,
        result: analysis.result,
        unit: analysis.um_result,
        method: analysis.method,
        ceirsaParameter: matchingParameter.parameter,
        satisfactoryValue: matchingParameter.satisfactoryValue,
        acceptableValue: matchingParameter.acceptableValue,
        unsatisfactoryValue: matchingParameter.unsatisfactoryValue,
        microbiologicalCriterion: matchingParameter.microbiologicalCriterion,
        analysisMethod: matchingParameter.analysisMethod,
        bibliographicReferences: matchingParameter.bibliographicReferences,
        notes: matchingParameter.notes,
        categoryName: category.name,
        categoryId: category.id,
        markdownContent,
      };

      const complianceResults = await checkCompliance(
        input,
        promptTemplate,
        formatInstructions,
        defaultModel,
        defaultParser
      );
      results.push(...complianceResults);
    }
  }

  return results;
};

export { createCeirsaCategoryMatcher, createFileSystemCeirsaCategoryProvider };
