import { ChatOpenAI } from "@langchain/openai";
import { ExtractedTextEntry } from "../extract_text_from_pdf";
import {
  extractAnalysesFromText,
  Analyses,
} from "../extract_analyses_from_text";
import {
  extractMatrixFromText,
  MatrixExtractionResult,
  SampleType,
} from "../extract_matrix_from_text";
import { getCeirsaCategories, CeirsaCategory } from "../ceirsa_categorizer";
import { ceirsaCheck, ceirsaComplianceCheck } from "./ceirsa.check";
import { beverageCheck, BeverageCheckInput } from "./beverage.check";
import { customCheck, customComplianceCheck } from "./custom.check";
import { environmentalSwabComplianceCheck } from "./environmental_swab.check";
import {
  customCheckService,
  CategoryWithParameters,
} from "../../custom-check.service";
import {
  isTextCorrupted,
  cleanCorruptedText,
  ocrPdfWithVision,
} from "../ocr_pdf_with_vision";
import {
  buildCeirsaCategoryMatchingPrompt,
  buildUniversalFoodSafetyPrompt,
} from "../../prompts/general_check.prompts";
import { getTavilyApiKey } from "../../utils/api-keys.utils";

export interface Source {
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
}

export interface ComplianceResultMatrix {
  matrix: string;
  description: string | null;
  product: string | null;
  category: "food" | "beverage" | "other";
  ceirsaCategory: string | null;
  /**
   * Type of sample: environmental_swab for surfaces (UFC/cm²), food_product for food (UFC/g), etc.
   * CRITICAL: environmental_swab samples cannot use CEIRSA food limits.
   */
  sampleType: SampleType;
}

/**
 * Raw compliance result without matrix information.
 * Used internally by check modules before matrix enrichment.
 */
export interface RawComplianceResult {
  name: string;
  value: string;
  isCheck: boolean | null; // true = conforme, false = non conforme, null = da confermare
  description: string;
  sources: Source[];
}

/**
 * Complete compliance result including matrix information.
 */
export interface ComplianceResult extends RawComplianceResult {
  matrix: ComplianceResultMatrix;
}

const composeMarkdownPayload = (textObjects: ExtractedTextEntry[]): string => {
  return textObjects
    .slice()
    .sort((left, right) => left.letter_number - right.letter_number)
    .map((entry) => entry.text_extracted?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();
};

/**
 * Uses LLM to find the best matching CEIRSA category for a given product/matrix.
 */
const findCeirsaCategoryWithLLM = async (
  matrix: MatrixExtractionResult,
  categories: CeirsaCategory[]
): Promise<CeirsaCategory | null> => {
  const categoryNames = categories.map((cat) => cat.name);
  const prompt = buildCeirsaCategoryMatchingPrompt(matrix, categoryNames);

  try {
    const matcherModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const response = await matcherModel.invoke(prompt);
    const result = response.content?.toString().trim();

    console.log(
      `[checks.llm] CEIRSA category LLM response: "${result}" for product "${matrix.product}"`
    );

    if (!result || result === "NESSUNA") {
      return null;
    }

    // Try to parse as number (category index)
    const categoryIndex = parseInt(result, 10);
    if (
      !isNaN(categoryIndex) &&
      categoryIndex >= 1 &&
      categoryIndex <= categoryNames.length
    ) {
      const matchedCategory = categories[categoryIndex - 1];
      console.log(
        `[checks.llm] Matched category by index: ${matchedCategory?.name}`
      );
      return matchedCategory ?? null;
    }

    // Fall back to name matching
    const matchedCategory = categories.find(
      (cat) =>
        cat.name.toLowerCase() === result.toLowerCase() ||
        cat.name.toLowerCase().includes(result.toLowerCase()) ||
        result.toLowerCase().includes(cat.name.toLowerCase())
    );

    console.log(
      `[checks.llm] Matched category by name: ${
        matchedCategory?.name ?? "none"
      }`
    );

    return matchedCategory ?? null;
  } catch (error) {
    console.warn("[checks] LLM category matching failed:", error);
    return null;
  }
};

/**
 * Attempts to find a matching CEIRSA category based on product name or matrix description.
 * Uses simple string matching first, then falls back to LLM for semantic matching.
 */
const findCeirsaCategoryByProduct = async (
  matrix: MatrixExtractionResult
): Promise<CeirsaCategory | null> => {
  const searchTerms = [
    matrix.product,
    matrix.matrix,
    matrix.description,
  ].filter((term): term is string => Boolean(term?.trim()));

  if (searchTerms.length === 0) {
    return null;
  }

  try {
    const categories = await getCeirsaCategories();

    // Try simple string matching first
    for (const term of searchTerms) {
      const normalizedTerm = term.toLowerCase().trim();

      const exactMatch = categories.find((cat) => {
        const catNameLower = cat.name.toLowerCase();
        return (
          catNameLower.includes(normalizedTerm) ||
          normalizedTerm.includes(catNameLower.split(" ")[0] ?? "")
        );
      });

      if (exactMatch) {
        return exactMatch;
      }
    }

    // Fall back to LLM-based matching
    return await findCeirsaCategoryWithLLM(matrix, categories);
  } catch (error) {
    console.warn("[checks] Error finding CEIRSA category by product:", error);
    return null;
  }
};

/**
 * Builds the matrix object to include in compliance results.
 */
const buildComplianceResultMatrix = (
  matrix: MatrixExtractionResult,
  ceirsaCategoryName: string | null
): ComplianceResultMatrix => ({
  matrix: matrix.matrix,
  description: matrix.description,
  product: matrix.product,
  category: matrix.category,
  ceirsaCategory: ceirsaCategoryName,
  sampleType: matrix.sampleType,
});

/**
 * Adds the matrix information to each compliance result.
 */
const enrichResultsWithMatrix = (
  results: RawComplianceResult[],
  matrixInfo: ComplianceResultMatrix
): ComplianceResult[] => {
  return results.map((result) => ({
    ...result,
    matrix: matrixInfo,
  }));
};

/**
 * Checks if a sample type is an environmental/surface swab.
 * Environmental swabs use UFC/cm² units and CANNOT be compared to CEIRSA food limits (UFC/g).
 */
const isEnvironmentalSample = (sampleType: SampleType): boolean => {
  return sampleType === "environmental_swab" || sampleType === "personnel_swab";
};

export const checks = async (
  textObjects: ExtractedTextEntry[]
): Promise<ComplianceResult[]> => {
  const markdownContent = composeMarkdownPayload(textObjects);

  if (!markdownContent) {
    return [];
  }

  const matrix = await extractMatrixFromText(textObjects);
  console.log(
    `[checks.standard] Matrix: ${JSON.stringify({
      matrix: matrix.matrix,
      product: matrix.product,
      category: matrix.category,
      sampleType: matrix.sampleType,
    })}`
  );

  // CRITICAL CHECK: Environmental/surface swabs cannot use CEIRSA food limits
  if (isEnvironmentalSample(matrix.sampleType)) {
    console.log(
      `[checks.standard] Environmental sample detected (${matrix.sampleType}): ${matrix.matrix}. ` +
        `CEIRSA food limits (UFC/g) NOT applicable to surface swabs (UFC/cm²). Using environmental swab check.`
    );
    const analyses = await extractAnalysesFromText(textObjects);
    const rawResults = await environmentalSwabComplianceCheck({
      matrix,
      analyses,
      markdownContent,
    });
    const matrixInfo = buildComplianceResultMatrix(matrix, null);
    return enrichResultsWithMatrix(rawResults, matrixInfo);
  }

  // Prima verifica se rientra in una categoria CEIRSA
  const ceirsaCategory = await ceirsaCheck(matrix);
  console.log(
    `[checks.standard] CEIRSA category: ${ceirsaCategory?.name ?? "none"}`
  );

  // Se è categorizzata CEIRSA direttamente, usa ceirsaComplianceCheck
  if (ceirsaCategory) {
    const analyses = await extractAnalysesFromText(textObjects);
    console.log(
      `[checks.standard] Running CEIRSA check with ${analyses.length} analyses`
    );
    const rawResults = await ceirsaComplianceCheck(
      ceirsaCategory,
      analyses,
      markdownContent
    );
    console.log(`[checks.standard] CEIRSA results: ${rawResults.length}`);
    const matrixInfo = buildComplianceResultMatrix(matrix, ceirsaCategory.name);
    return enrichResultsWithMatrix(rawResults, matrixInfo);
  }

  // Se non rientra in nessuna categoria CEIRSA e la categoria è "beverage", usa beverageCheck
  if (matrix.category === "beverage") {
    console.log(`[checks.standard] Beverage detected`);
    const analyses = await extractAnalysesFromText(textObjects);
    const rawResults: RawComplianceResult[] = [];

    for (const analysis of analyses) {
      const beverageInput: BeverageCheckInput = {
        parameter: analysis.parameter,
        value: analysis.result,
        unit: analysis.um_result || null,
        beverageType: matrix.product || matrix.matrix || "bevanda",
        markdownContent,
      };

      const complianceResults = await beverageCheck(beverageInput);
      rawResults.push(...complianceResults);
    }

    const matrixInfo = buildComplianceResultMatrix(matrix, null);
    return enrichResultsWithMatrix(rawResults, matrixInfo);
  }

  // Per categoria "food" (solo campioni alimentari diretti), prova a trovare una categoria CEIRSA
  if (matrix.category === "food" && matrix.sampleType === "food_product") {
    console.log(
      `[checks.standard] Food product - trying to find CEIRSA category by product name`
    );
    const fallbackCategory = await findCeirsaCategoryByProduct(matrix);
    console.log(
      `[checks.standard] Fallback CEIRSA category: ${
        fallbackCategory?.name ?? "none"
      }`
    );

    if (fallbackCategory) {
      const analyses = await extractAnalysesFromText(textObjects);
      const rawResults = await ceirsaComplianceCheck(
        fallbackCategory,
        analyses,
        markdownContent
      );
      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        fallbackCategory.name
      );
      return enrichResultsWithMatrix(rawResults, matrixInfo);
    }
  }

  // FALLBACK: Controlli di sicurezza alimentare universali
  // Anche senza categoria CEIRSA, alcuni patogeni hanno limiti obbligatori per legge (Reg. CE 2073/2005)
  if (matrix.category === "food" || matrix.sampleType === "food_product") {
    console.log(
      `[checks.standard] Applying universal food safety checks (Reg. CE 2073/2005)`
    );
    const analyses = await extractAnalysesFromText(textObjects);
    const safetyResults = await applyUniversalFoodSafetyChecks(
      analyses,
      markdownContent
    );

    if (safetyResults.length > 0) {
      console.log(
        `[checks.standard] Found ${safetyResults.length} safety-critical results`
      );
      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        "Reg. CE 2073/2005 - Sicurezza Alimentare"
      );
      return enrichResultsWithMatrix(safetyResults, matrixInfo);
    }
  }

  // Se non è stato possibile trovare una categoria, prova con ricerca Tavily generica
  console.log(
    `[checks.standard] No matching category found - trying Tavily search as fallback`
  );
  const analyses = await extractAnalysesFromText(textObjects);

  if (analyses.length > 0) {
    // Search with Tavily for general regulatory context
    const tavilyResult = await searchRegulatoryContext(
      analyses,
      "limiti normativa sicurezza alimentare criteri microbiologici"
    );

    if (tavilyResult.sources.length > 0) {
      console.log(
        `[checks.standard] Found ${tavilyResult.sources.length} regulatory sources via Tavily, applying generic check`
      );
      const safetyResults = await applyUniversalFoodSafetyChecks(
        analyses,
        markdownContent
      );

      if (safetyResults.length > 0) {
        console.log(
          `[checks.standard] Found ${safetyResults.length} results via Tavily fallback`
        );
        const matrixInfo = buildComplianceResultMatrix(
          matrix,
          "Ricerca normativa (Tavily)"
        );
        return enrichResultsWithMatrix(safetyResults, matrixInfo);
      }
    }
  }

  console.log(`[checks.standard] No results found - returning empty`);
  return [];
};

/**
 * Tavily search result with structured sources.
 */
export interface TavilySearchResult {
  contextText: string;
  sources: Source[];
}

/**
 * Searches Tavily for regulatory context and returns both formatted text and structured sources.
 *
 * @param analyses - Array of analyses to search for
 * @param querySuffix - Additional terms to add to the search query (e.g., "limiti superfici HACCP")
 * @returns Object with context text and structured sources
 */
export const searchRegulatoryContext = async (
  analyses: Analyses[],
  querySuffix: string = "limiti sicurezza alimentare normativa"
): Promise<TavilySearchResult> => {
  const apiKey = await getTavilyApiKey();
  if (!apiKey) {
    console.log("[checks] No Tavily API key, skipping regulatory search");
    return { contextText: "", sources: [] };
  }

  try {
    const parameterNames = analyses
      .map((a) => a.parameter)
      .slice(0, 5)
      .join(", ");

    const query = `${parameterNames} ${querySuffix}`;

    // Create AbortController with longer timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: 5,
          include_answer: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(
          `[checks] Tavily API returned error: ${response.status} ${response.statusText}`
        );
        return { contextText: "", sources: [] };
      }

      const result = (await response.json()) as {
        answer?: string;
        results?: {
          content?: string;
          url?: string;
          title?: string;
        }[];
      };

      // Build structured sources
      const structuredSources: Source[] = (result.results ?? [])
        .map((item, index) => {
          const content = item.content?.trim();
          if (!content) return null;

          return {
            id: `tavily-source-${index + 1}`,
            title: item.title || `Fonte normativa ${index + 1}`,
            url: item.url || null,
            excerpt: content.substring(0, 500), // Limit excerpt length
          };
        })
        .filter((item): item is Source => Boolean(item));

      // Build formatted text for LLM context
      const formattedResults = (result.results ?? [])
        .map((item, index) => {
          const content = item.content?.trim();
          if (!content) return null;

          return `[FONTE ${index + 1}]
Titolo: ${item.title || `Fonte ${index + 1}`}
URL: ${item.url || "N/A"}
Contenuto: ${content}`;
        })
        .filter((item): item is string => Boolean(item));

      const answer = result.answer
        ? `RISPOSTA TAVILY:\n${result.answer}\n\n`
        : "";
      const sources =
        formattedResults.length > 0
          ? `FONTI TROVATE:\n${formattedResults.join("\n\n")}`
          : "";

      const contextText = [answer, sources].filter(Boolean).join("\n\n").trim();

      console.log(
        `[checks] Tavily search found ${structuredSources.length} sources for query: ${query}`
      );

      return { contextText, sources: structuredSources };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (
        fetchError.name === "AbortError" ||
        fetchError.code === "UND_ERR_CONNECT_TIMEOUT"
      ) {
        console.warn(
          `[checks] Tavily search timeout - connection took too long. Continuing without Tavily sources.`
        );
      } else {
        console.warn(
          `[checks] Tavily search failed: ${
            fetchError.message || fetchError
          }. Continuing without Tavily sources.`
        );
      }
      return { contextText: "", sources: [] };
    }
  } catch (error: any) {
    console.warn(
      `[checks] Tavily search error: ${
        error.message || error
      }. Continuing without Tavily sources.`
    );
    return { contextText: "", sources: [] };
  }
};

/**
 * Searches Tavily for food safety regulatory context (legacy function, kept for compatibility).
 */
const searchFoodSafetyContext = async (
  analyses: Analyses[]
): Promise<string> => {
  const result = await searchRegulatoryContext(
    analyses,
    "limiti sicurezza alimentare Regolamento CE 2073/2005 criteri microbiologici alimenti"
  );
  return result.contextText;
};

/**
 * Universal food safety checks based on EU Regulation 2073/2005.
 * Uses Tavily for real regulatory sources + LLM for evaluation.
 */
const applyUniversalFoodSafetyChecks = async (
  analyses: Analyses[],
  markdownContent: string
): Promise<RawComplianceResult[]> => {
  if (analyses.length === 0) return [];

  // Search for real regulatory context via Tavily with structured sources
  const tavilyResult = await searchRegulatoryContext(
    analyses,
    "limiti sicurezza alimentare Regolamento CE 2073/2005 criteri microbiologici alimenti"
  );
  const lawContext = tavilyResult.contextText;
  const analysesJson = JSON.stringify(analyses, null, 2);

  const prompt = buildUniversalFoodSafetyPrompt(
    analysesJson,
    lawContext,
    markdownContent
  );

  try {
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const response = await model.invoke(prompt);
    const content = response.content?.toString() ?? "[]";

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("[checks.safety] No valid JSON in LLM response");
      return [];
    }

    interface SafetyCheckResult {
      name: string;
      value: string;
      isCheck: boolean;
      description: string;
      sources?: Array<{
        id: string;
        title: string;
        url: string | null;
        excerpt: string;
      }>;
    }

    const parsed = JSON.parse(jsonMatch[0]) as SafetyCheckResult[];

    return parsed.map((item) => {
      // Merge LLM sources with Tavily sources (avoid duplicates)
      const llmSources = item.sources || [];
      const llmSourceIds = new Set(llmSources.map((s) => s.id));
      const newTavilySources = tavilyResult.sources.filter(
        (s) => !llmSourceIds.has(s.id)
      );

      const allSources =
        llmSources.length > 0
          ? [...llmSources, ...newTavilySources]
          : [
              {
                id: `safety-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
                title: "Reg. CE 2073/2005 - Criteri microbiologici",
                url: null,
                excerpt: item.description,
              },
              ...tavilyResult.sources,
            ];

      return {
        name: `${item.name} (Sicurezza Alimentare)`,
        value: item.value,
        isCheck: item.isCheck,
        description: item.description,
        sources: allSources,
      };
    });
  } catch (error) {
    console.error("[checks.safety] LLM evaluation failed:", error);
    return [];
  }
};

/**
 * Options for compliance checking with custom category support.
 */
export interface ChecksOptions {
  /**
   * ID of a custom check category to use instead of auto-detection.
   * When provided, the custom category will be used directly.
   */
  customCategoryId?: string;

  /**
   * If true, also try custom categories when standard checks fail.
   * Default: false
   */
  fallbackToCustom?: boolean;

  /**
   * Path to the original PDF file for OCR fallback.
   * When provided and text appears corrupted, will use GPT-4 Vision OCR.
   */
  pdfPath?: string;

  /**
   * If true, always use OCR extraction regardless of corruption detection.
   * Useful for PDFs that have missing data but don't trigger corruption detection.
   * Default: false
   */
  forceOcr?: boolean;
}

/**
 * Extended result from checksWithOptions including extracted data.
 * Used when OCR fallback is triggered to return the OCR-extracted text objects.
 */
export interface ChecksWithOptionsResult {
  results: ComplianceResult[];
  /** The text objects actually used for analysis (may be OCR-extracted if original was corrupted) */
  effectiveTextObjects: ExtractedTextEntry[];
  /** The matrix extracted from the effective text objects */
  effectiveMatrix: MatrixExtractionResult | null;
  /** The analyses extracted from the effective text objects */
  effectiveAnalyses: Analyses[];
  /** Whether OCR fallback was used */
  usedOcrFallback: boolean;
}

/**
 * Extended checks function with support for custom categories.
 * Returns detailed results including the effective text objects used (important when OCR fallback is triggered).
 *
 * @param textObjects - Extracted text from PDF
 * @param options - Optional configuration for custom category usage
 * @returns Object containing compliance results and the effective text objects used
 */
export const checksWithOptions = async (
  textObjects: ExtractedTextEntry[],
  options: ChecksOptions = {}
): Promise<ChecksWithOptionsResult> => {
  let markdownContent = composeMarkdownPayload(textObjects);
  let effectiveTextObjects = textObjects;
  let usedOcrFallback = false;

  if (!markdownContent) {
    return {
      results: [],
      effectiveTextObjects: textObjects,
      effectiveMatrix: null,
      effectiveAnalyses: [],
      usedOcrFallback: false,
    };
  }

  // Check if text appears corrupted OR forceOcr is enabled, and OCR fallback is available
  const pdfPath = options.pdfPath;
  const shouldUseOcr = pdfPath && (options.forceOcr || isTextCorrupted(markdownContent));

  if (shouldUseOcr && pdfPath) {
    const reason = options.forceOcr ? "forceOcr enabled" : "corrupted text detected";
    console.log(
      `[checks] ⚠️ Using GPT-4 Vision OCR (${reason})...`
    );

    try {
      const ocrResults = await ocrPdfWithVision(pdfPath);
      const ocrText = ocrResults.map((r) => r.text).join("\n\n");

      if (ocrText.length > 100) {
        console.log(
          `[checks] ✓ Vision OCR successful: ${ocrText.length} chars extracted`
        );
        markdownContent = ocrText;
        usedOcrFallback = true;

        // Create synthetic text objects from OCR results
        effectiveTextObjects = ocrResults.map((r, idx) => ({
          resource: `ocr-page-${r.pageNumber}`,
          word_number: r.text.split(/\s+/).length,
          letter_number: idx * 10000,
          text_extracted: r.text,
        }));
      }
    } catch (ocrError) {
      console.warn(`[checks] Vision OCR failed, using cleaned text:`, ocrError);
      markdownContent = cleanCorruptedText(markdownContent);
    }
  } else if (isTextCorrupted(markdownContent)) {
    console.log(`[checks] ⚠️ Corrupted text detected, cleaning...`);
    markdownContent = cleanCorruptedText(markdownContent);
  }

  const matrix = await extractMatrixFromText(effectiveTextObjects);
  const analyses = await extractAnalysesFromText(effectiveTextObjects);

  // Helper to build the result object
  const buildResult = (results: ComplianceResult[]): ChecksWithOptionsResult => ({
    results,
    effectiveTextObjects,
    effectiveMatrix: matrix,
    effectiveAnalyses: analyses,
    usedOcrFallback,
  });

  console.log(`[checks] Extracted ${analyses.length} analyses from PDF`);
  if (analyses.length > 0) {
    console.log(
      `[checks] Analyses: ${JSON.stringify(
        analyses.map((a) => ({ param: a.parameter, result: a.result }))
      )}`
    );
  }

  // If a custom category is explicitly specified, use it directly
  if (options.customCategoryId) {
    const customCategory = await customCheckService.getCategoryById(
      options.customCategoryId
    );

    if (customCategory) {
      console.log(`[checks] Using custom category: ${customCategory.name}`);
      const rawResults = await customComplianceCheck(
        customCategory,
        analyses,
        markdownContent
      );
      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        `custom:${customCategory.name}`
      );
      return buildResult(enrichResultsWithMatrix(rawResults, matrixInfo));
    } else {
      console.warn(
        `[checks] Custom category not found: ${options.customCategoryId}`
      );
    }
  }

  // SPECIAL HANDLING: Environmental/surface swabs should use custom categories
  // CEIRSA limits (UFC/g) are NOT applicable to surface swabs (UFC/cm²)
  if (isEnvironmentalSample(matrix.sampleType) && options.fallbackToCustom) {
    console.log(
      `[checks] Environmental sample detected (${matrix.sampleType}): ${matrix.matrix}. ` +
        `Checking against custom categories for surfaces/swabs.`
    );

    const allCustomCategories = await customCheckService.getAllCategories();
    const matchingSampleType = mapMatrixToCustomSampleType(matrix);

    // Find custom categories that match this sample type
    const matchingCategories = allCustomCategories.filter(
      (cat) => cat.sampleType === matchingSampleType
    );

    console.log(
      `[checks] Found ${matchingCategories.length} custom categories for ${matchingSampleType}: ` +
        matchingCategories.map((c) => c.name).join(", ")
    );

    // Try ALL matching categories and combine results
    const allResults: RawComplianceResult[] = [];
    const matchedCategories: string[] = [];

    for (const customCategory of matchingCategories) {
      console.log(`[checks] Trying custom category: ${customCategory.name}`);
      const rawResults = await customComplianceCheck(
        customCategory,
        analyses,
        markdownContent
      );

      if (rawResults.length > 0) {
        console.log(
          `[checks] ✓ Found ${rawResults.length} results with category: ${customCategory.name}`
        );
        allResults.push(...rawResults);
        matchedCategories.push(customCategory.name);
      }
    }

    // If we found results from any category, return them
    if (allResults.length > 0) {
      const categoryLabel =
        matchedCategories.length > 1
          ? `custom:${matchedCategories.join(", ")}`
          : `custom:${matchedCategories[0]}`;
      const matrixInfo = buildComplianceResultMatrix(matrix, categoryLabel);
      return buildResult(enrichResultsWithMatrix(allResults, matrixInfo));
    }

    // If no custom categories matched, use environmental swab check with LLM
    console.log(
      `[checks] No matching custom categories found for environmental sample. Using environmental swab check.`
    );
    const rawResults = await environmentalSwabComplianceCheck({
      matrix,
      analyses,
      markdownContent,
    });
    const matrixInfo = buildComplianceResultMatrix(matrix, null);
    return buildResult(enrichResultsWithMatrix(rawResults, matrixInfo));
  }

  // Run standard checks for non-environmental samples
  // IMPORTANT: Use effectiveTextObjects (may be OCR-extracted) instead of original textObjects
  const standardResults = await checks(effectiveTextObjects);

  // If standard checks returned results, use them
  if (standardResults.length > 0) {
    return buildResult(standardResults);
  }

  // If fallbackToCustom is enabled and standard checks failed, try custom categories
  if (options.fallbackToCustom) {
    const allCustomCategories = await customCheckService.getAllCategories();

    // Try to find a matching custom category based on sample type
    const matchingSampleType = mapMatrixToCustomSampleType(matrix);
    const matchingCategories = allCustomCategories.filter(
      (cat) => cat.sampleType === matchingSampleType
    );

    for (const customCategory of matchingCategories) {
      console.log(
        `[checks] Trying custom category fallback: ${customCategory.name}`
      );
      const rawResults = await customComplianceCheck(
        customCategory,
        analyses,
        markdownContent
      );

      if (rawResults.length > 0) {
        const matrixInfo = buildComplianceResultMatrix(
          matrix,
          `custom:${customCategory.name}`
        );
        return buildResult(enrichResultsWithMatrix(rawResults, matrixInfo));
      }
    }
  }

  return buildResult([]);
};

/**
 * Maps matrix sample type to custom check sample type enum.
 */
const mapMatrixToCustomSampleType = (
  matrix: MatrixExtractionResult
): string => {
  switch (matrix.sampleType) {
    case "food_product":
      return "FOOD_PRODUCT";
    case "environmental_swab":
      return "ENVIRONMENTAL_SWAB";
    case "personnel_swab":
      return "PERSONNEL_SWAB";
    default:
      if (matrix.category === "beverage") return "BEVERAGE";
      return "OTHER";
  }
};

// Re-export custom check functions for direct usage
export { customCheck, customComplianceCheck };
