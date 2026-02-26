import { ExtractedTextEntry } from "../extract_text_from_pdf";
import { createLLM } from "../../utils/llm-factory";
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

/**
 * Authoritative Italian/EU food safety domains for regulatory searches.
 * Used by Tavily API's include_domains parameter for prioritized searches.
 */
const AUTHORITATIVE_FOOD_SAFETY_DOMAINS: string[] = [
  "ceirsa.it",
  "efsa.europa.eu",
  "salute.gov.it",
  "eur-lex.europa.eu",
  "gazzettaufficiale.it",
  "izsto.it",
  "izslt.it",
  "izsam.it",
  "izsvenezie.it",
  "iss.it",
];

/**
 * Check if a URL belongs to an authoritative food safety domain.
 */
const isAuthoritativeSource = (url: string | null): boolean => {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return AUTHORITATIVE_FOOD_SAFETY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};

export interface TavilySearchOptions {
  /** If true, first attempt search with authoritative domains only (default: true) */
  prioritizeAuthoritativeSources?: boolean;
  /** Additional domains to include (merged with defaults) */
  additionalDomains?: string[];
  /** Search depth: "basic" or "advanced" (default: "advanced" for pass 1) */
  searchDepth?: "basic" | "advanced";
}

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

/**
 * Pre-extracted data to avoid redundant LLM calls.
 * When provided, checks() will use these instead of re-extracting.
 */
export interface PreExtractedData {
  matrix?: MatrixExtractionResult;
  analyses?: Analyses[];
}

/**
 * Diagnostic information about why compliance checks returned empty or partial results.
 */
export interface ChecksDiagnostics {
  matrixDetected: {
    matrix: string;
    category: string;
    sampleType: string;
    product: string | null;
  };
  analysesCount: number;
  analysesParameters: string[];
  checkPathsAttempted: string[];
  usedOcrFallback: boolean;
  summary: string;
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
    const { model: matcherModel } = await createLLM({
      capability: "text",
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
 * Prepends the CeIRSA status source to all results' sources arrays.
 * CeIRSA must always appear as the first source in every result.
 */
const prependCeirsaSource = (
  results: RawComplianceResult[],
  ceirsaSource: Source
): RawComplianceResult[] => {
  return results.map((result) => {
    const existingIds = new Set(result.sources.map((s) => s.id));
    if (existingIds.has(ceirsaSource.id)) return result;
    return {
      ...result,
      sources: [ceirsaSource, ...result.sources],
    };
  });
};

/**
 * Checks if a sample type is an environmental/surface swab.
 * Environmental swabs use UFC/cm² units and CANNOT be compared to CEIRSA food limits (UFC/g).
 */
const isEnvironmentalSample = (sampleType: SampleType): boolean => {
  return sampleType === "environmental_swab" || sampleType === "personnel_swab";
};

/**
 * Checks analyses that were not covered by CEIRSA using Tavily search.
 * Used for parameters like Pseudomonas that may not have CEIRSA limits.
 */
const checkUncheckedAnalysesWithTavily = async (
  analyses: Analyses[],
  markdownContent: string,
  productName: string
): Promise<RawComplianceResult[]> => {
  if (analyses.length === 0) return [];

  console.log(
    `[checks.tavily] Checking ${analyses.length} unchecked analyses with Tavily`
  );

  // Search Tavily for regulatory context for these specific parameters
  const paramNames = analyses.map((a) => a.parameter).join(", ");
  const tavilyResult = await searchRegulatoryContext(
    analyses,
    `limiti microbiologici ${productName} ${paramNames} criteri igiene processo`
  );

  const analysesJson = JSON.stringify(analyses, null, 2);

  // Extract only the parameter names we need to check
  const parameterNames = analyses.map((a) => a.parameter);

  const prompt = `Sei un esperto di sicurezza alimentare e normativa italiana/europea.

PRODOTTO: ${productName}

ANALISI DA VALUTARE (SOLO questi parametri specifici, gli altri sono già stati controllati):
${analysesJson}

CONTESTO NORMATIVO (da fonti esterne):
${
  tavilyResult.contextText ||
  "Nessun contesto normativo specifico trovato. Usa la tua conoscenza delle buone pratiche igieniche."
}

CONTESTO DOCUMENTO (estratto):
${markdownContent.substring(0, 800)}

COMPITO:
Valuta ESCLUSIVAMENTE i ${analyses.length} parametri elencati sopra:
${parameterNames.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Per parametri come Pseudomonas, Coliformi, CBT, Enterobacteriaceae:
- Se esistono limiti normativi specifici, applicali
- Se non esistono limiti normativi ma sono indicatori igienici, valuta secondo buone pratiche HACCP
- Per conta batterica generica, valori < 10 o < 100 UFC/g sono generalmente accettabili

FORMATO RISPOSTA (JSON array con ESATTAMENTE ${analyses.length} elementi):
[
  {
    "name": "Nome parametro ESATTO come nell'elenco sopra",
    "value": "Limite o criterio applicato",
    "isCheck": true/false,
    "description": "Spiegazione della valutazione",
    "sources": [
      {
        "id": "fonte-id",
        "title": "Titolo fonte",
        "url": null,
        "excerpt": "Estratto o riferimento"
      }
    ]
  }
]

REGOLE CRITICHE:
- Restituisci ESATTAMENTE ${analyses.length} risultati, uno per ogni parametro nell'elenco
- NON includere altri parametri che non sono nell'elenco (sono già stati controllati da CEIRSA)
- Per Pseudomonas in prodotti lattiero-caseari freschi, < 10 UFC/g è generalmente accettabile
- isCheck = true se il risultato è accettabile, false se non accettabile

JSON:`;

  try {
    const { model } = await createLLM({
      capability: "text",
      temperature: 0,
    });

    const response = await model.invoke(prompt);
    const content = response.content?.toString() ?? "[]";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("[checks.tavily] No valid JSON in LLM response");
      return [];
    }

    interface TavilyCheckResult {
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

    const parsed = JSON.parse(jsonMatch[0]) as TavilyCheckResult[];
    console.log(`[checks.tavily] Parsed ${parsed.length} results`);

    // Filter to only include results for parameters we actually asked about
    const requestedParamsLower = parameterNames.map((p) => p.toLowerCase());
    const filteredResults = parsed.filter((item) => {
      const itemNameLower = item.name.toLowerCase();
      return requestedParamsLower.some(
        (reqParam) =>
          itemNameLower.includes(reqParam) ||
          reqParam.includes(itemNameLower) ||
          // Match key parts of parameter names
          (itemNameLower.includes("pseudomonas") && reqParam.includes("pseudomonas")) ||
          (itemNameLower.includes("enterobact") && reqParam.includes("enterobact"))
      );
    });

    console.log(
      `[checks.tavily] Filtered to ${filteredResults.length} results (requested: ${parameterNames.join(", ")})`
    );

    return filteredResults.map((item) => {
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
                id: `hygiene-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
                title: "Criteri Igiene di Processo",
                url: null,
                excerpt: item.description,
              },
              ...tavilyResult.sources,
            ];

      return {
        name: item.name,
        value: item.value,
        isCheck: item.isCheck,
        description: item.description,
        sources: allSources,
      };
    });
  } catch (error) {
    console.error("[checks.tavily] LLM evaluation failed:", error);
    return [];
  }
};

export const checks = async (
  textObjects: ExtractedTextEntry[],
  preExtracted?: PreExtractedData
): Promise<ComplianceResult[]> => {
  const markdownContent = composeMarkdownPayload(textObjects);

  if (!markdownContent) {
    return [];
  }

  // Extract matrix and analyses ONCE, reusing pre-extracted data if available
  const matrix = preExtracted?.matrix ?? await extractMatrixFromText(textObjects);
  const analyses = preExtracted?.analyses ?? await extractAnalysesFromText(textObjects);

  console.log(
    `[checks.standard] Matrix: ${JSON.stringify({
      matrix: matrix.matrix,
      product: matrix.product,
      category: matrix.category,
      sampleType: matrix.sampleType,
    })}`
  );
  console.log(`[checks.standard] Analyses count: ${analyses.length}`);

  // SEMPRE: verifica CeIRSA come primo controllo per qualsiasi tipo di campione
  const ceirsaCategory = await ceirsaCheck(matrix);
  console.log(
    `[checks.standard] CEIRSA category: ${ceirsaCategory?.name ?? "none"}`
  );

  // Build CeIRSA status source to include in ALL results
  const ceirsaStatusSource: Source = ceirsaCategory
    ? {
        id: `ceirsa-category-${ceirsaCategory.id}`,
        title: `CeIRSA - ${ceirsaCategory.name}`,
        url: null,
        excerpt: `Categoria CeIRSA trovata: ${ceirsaCategory.name} (ID: ${ceirsaCategory.id}). ${
          ceirsaCategory.data?.length ?? 0
        } parametri microbiologici disponibili.`,
      }
    : {
        id: "ceirsa-no-match",
        title: "CeIRSA - Nessuna corrispondenza",
        url: null,
        excerpt: `Nessuna categoria CeIRSA corrispondente trovata per: ${matrix.matrix}${
          matrix.product ? ` (${matrix.product})` : ""
        }. I limiti mostrati provengono da altre fonti normative.`,
      };

  // Environmental/surface swabs: CeIRSA food limits (UFC/g) non applicabili direttamente a UFC/cm²
  if (isEnvironmentalSample(matrix.sampleType)) {
    console.log(
      `[checks.standard] Environmental sample detected (${matrix.sampleType}): ${matrix.matrix}. ` +
        `Using environmental swab check with CeIRSA status.`
    );
    const rawResults = await environmentalSwabComplianceCheck({
      matrix,
      analyses,
      markdownContent,
      ceirsaCategory,
      ceirsaStatusSource,
    });
    const matrixInfo = buildComplianceResultMatrix(
      matrix,
      ceirsaCategory?.name ?? null
    );
    return enrichResultsWithMatrix(rawResults, matrixInfo);
  }

  // Se è categorizzata CEIRSA direttamente, usa ceirsaComplianceCheck
  if (ceirsaCategory) {
    console.log(
      `[checks.standard] Running CEIRSA check with ${analyses.length} analyses`
    );
    const rawResults = await ceirsaComplianceCheck(
      ceirsaCategory,
      analyses,
      markdownContent
    );
    console.log(`[checks.standard] CEIRSA results: ${rawResults.length}`);

    // Identifica le analisi NON controllate da CEIRSA
    const checkedParams = new Set(
      rawResults.map((r) => r.name.toLowerCase())
    );
    const uncheckedAnalyses = analyses.filter((a) => {
      const paramLower = a.parameter.toLowerCase();
      return !Array.from(checkedParams).some(
        (checked) =>
          checked.includes(paramLower) ||
          paramLower.includes(checked) ||
          (paramLower.includes("enterobact") && checked.includes("enterobact")) ||
          (paramLower.includes("coli") && checked.includes("coli")) ||
          (paramLower.includes("stafilococc") && checked.includes("stafilococc")) ||
          (paramLower.includes("salmonella") && checked.includes("salmonella")) ||
          (paramLower.includes("listeria") && checked.includes("listeria"))
      );
    });

    console.log(
      `[checks.standard] Unchecked analyses: ${uncheckedAnalyses.length} - ${uncheckedAnalyses.map((a) => a.parameter).join(", ")}`
    );

    if (uncheckedAnalyses.length > 0) {
      const additionalResults = await checkUncheckedAnalysesWithTavily(
        uncheckedAnalyses,
        markdownContent,
        matrix.product || matrix.matrix || "alimento"
      );
      console.log(
        `[checks.standard] Additional results from Tavily: ${additionalResults.length}`
      );
      rawResults.push(...additionalResults);
    }

    const matrixInfo = buildComplianceResultMatrix(matrix, ceirsaCategory.name);
    return enrichResultsWithMatrix(
      prependCeirsaSource(rawResults, ceirsaStatusSource),
      matrixInfo
    );
  }

  // Se non rientra in nessuna categoria CEIRSA e la categoria è "beverage", usa beverageCheck
  if (matrix.category === "beverage") {
    console.log(`[checks.standard] Beverage detected`);
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
    return enrichResultsWithMatrix(
      prependCeirsaSource(rawResults, ceirsaStatusSource),
      matrixInfo
    );
  }

  // Water samples: apply universal safety checks
  if (matrix.sampleType === "water") {
    console.log(`[checks.standard] Water sample detected - applying universal safety checks`);
    const safetyResults = await applyUniversalFoodSafetyChecks(
      analyses,
      markdownContent
    );
    if (safetyResults.length > 0) {
      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        "Reg. CE 2073/2005 - Controllo Acque"
      );
      return enrichResultsWithMatrix(
        prependCeirsaSource(safetyResults, ceirsaStatusSource),
        matrixInfo
      );
    }
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
      const rawResults = await ceirsaComplianceCheck(
        fallbackCategory,
        analyses,
        markdownContent
      );
      console.log(`[checks.standard] Fallback CEIRSA results: ${rawResults.length}`);

      const checkedParams = new Set(
        rawResults.map((r) => r.name.toLowerCase())
      );
      const uncheckedAnalyses = analyses.filter((a) => {
        const paramLower = a.parameter.toLowerCase();
        return !Array.from(checkedParams).some(
          (checked) =>
            checked.includes(paramLower) ||
            paramLower.includes(checked) ||
            (paramLower.includes("enterobact") && checked.includes("enterobact")) ||
            (paramLower.includes("coli") && checked.includes("coli")) ||
            (paramLower.includes("stafilococc") && checked.includes("stafilococc")) ||
            (paramLower.includes("salmonella") && checked.includes("salmonella")) ||
            (paramLower.includes("listeria") && checked.includes("listeria"))
        );
      });

      console.log(
        `[checks.standard] Fallback unchecked: ${uncheckedAnalyses.length} - ${uncheckedAnalyses.map((a) => a.parameter).join(", ")}`
      );

      if (uncheckedAnalyses.length > 0) {
        const additionalResults = await checkUncheckedAnalysesWithTavily(
          uncheckedAnalyses,
          markdownContent,
          matrix.product || matrix.matrix || "alimento"
        );
        console.log(
          `[checks.standard] Fallback additional results: ${additionalResults.length}`
        );
        rawResults.push(...additionalResults);
      }

      // Update ceirsaStatusSource with the fallback category info
      const fallbackCeirsaSource: Source = {
        id: `ceirsa-category-${fallbackCategory.id}`,
        title: `CeIRSA - ${fallbackCategory.name}`,
        url: null,
        excerpt: `Categoria CeIRSA trovata (fallback per prodotto): ${fallbackCategory.name} (ID: ${fallbackCategory.id}). ${
          fallbackCategory.data?.length ?? 0
        } parametri microbiologici disponibili.`,
      };

      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        fallbackCategory.name
      );
      return enrichResultsWithMatrix(
        prependCeirsaSource(rawResults, fallbackCeirsaSource),
        matrixInfo
      );
    }
  }

  // FALLBACK: Controlli di sicurezza alimentare universali
  // Anche senza categoria CEIRSA, alcuni patogeni hanno limiti obbligatori per legge (Reg. CE 2073/2005)
  // Broadened: also applies when category is "other" but analyses exist
  if (
    matrix.category === "food" ||
    matrix.sampleType === "food_product" ||
    (matrix.category === "other" && analyses.length > 0)
  ) {
    console.log(
      `[checks.standard] Applying universal food safety checks (Reg. CE 2073/2005) - category: ${matrix.category}, sampleType: ${matrix.sampleType}`
    );
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
      return enrichResultsWithMatrix(
        prependCeirsaSource(safetyResults, ceirsaStatusSource),
        matrixInfo
      );
    }
  }

  // Final fallback: try Tavily search for regulatory context + universal safety check
  if (analyses.length > 0) {
    console.log(
      `[checks.standard] Final fallback - trying Tavily search + universal safety check`
    );

    // Search for regulatory context (optional enrichment)
    const tavilyResult = await searchRegulatoryContext(
      analyses,
      "limiti normativa sicurezza alimentare criteri microbiologici"
    );

    if (tavilyResult.sources.length > 0) {
      console.log(
        `[checks.standard] Found ${tavilyResult.sources.length} regulatory sources via Tavily`
      );
    }

    // Always attempt universal safety check if analyses exist, regardless of Tavily
    const safetyResults = await applyUniversalFoodSafetyChecks(
      analyses,
      markdownContent
    );

    if (safetyResults.length > 0) {
      console.log(
        `[checks.standard] Found ${safetyResults.length} results via final fallback`
      );
      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        tavilyResult.sources.length > 0
          ? "Ricerca normativa (Tavily)"
          : "Valutazione sicurezza alimentare generica"
      );
      return enrichResultsWithMatrix(
        prependCeirsaSource(safetyResults, ceirsaStatusSource),
        matrixInfo
      );
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
 * Fallback: uses the active LLM (e.g. GPT-4o) to generate regulatory context
 * when Tavily API key is not available.
 */
const searchRegulatoryContextWithLLM = async (
  analyses: Analyses[],
  querySuffix: string
): Promise<TavilySearchResult> => {
  try {
    const parameterNames = analyses
      .map((a) => a.parameter)
      .slice(0, 5)
      .join(", ");

    const prompt = `Sei un esperto di sicurezza alimentare e normativa italiana/europea.

Cerca nella tua conoscenza il contesto normativo per i seguenti parametri di analisi:
Parametri: ${parameterNames}
Contesto ricerca: ${querySuffix}

Rispondi ESCLUSIVAMENTE in formato JSON valido (senza markdown, senza backtick):
{
  "answer": "Sintesi del contesto normativo applicabile (regolamenti, limiti, criteri)",
  "sources": [
    {
      "title": "Nome del regolamento o normativa (es. Reg. CE 2073/2005)",
      "content": "Contenuto rilevante: limiti specifici, criteri, articoli applicabili"
    }
  ]
}

Includi riferimenti a: Reg. CE 2073/2005, Reg. CE 852/2004, normative HACCP, linee guida regionali italiane, e qualsiasi altro regolamento pertinente ai parametri indicati.`;

    const { model } = await createLLM({
      capability: "search",
      temperature: 0,
    });

    const response = await model.invoke(prompt);
    const content = response.content?.toString() ?? "{}";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[checks.llm-fallback] No valid JSON in LLM response");
      return { contextText: "", sources: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      answer?: string;
      sources?: { title?: string; content?: string }[];
    };

    const structuredSources: Source[] = (parsed.sources ?? [])
      .map((item, index) => {
        const sourceContent = item.content?.trim();
        if (!sourceContent) return null;

        return {
          id: `llm-source-${index + 1}`,
          title: item.title || `Fonte normativa ${index + 1}`,
          url: null as string | null,
          excerpt: sourceContent.substring(0, 500),
        };
      })
      .filter((item): item is Source => Boolean(item));

    const formattedResults = (parsed.sources ?? [])
      .map((item, index) => {
        const sourceContent = item.content?.trim();
        if (!sourceContent) return null;

        return `[FONTE ${index + 1}]
Titolo: ${item.title || `Fonte ${index + 1}`}
URL: N/A (conoscenza modello)
Contenuto: ${sourceContent}`;
      })
      .filter((item): item is string => Boolean(item));

    const answer = parsed.answer
      ? `CONTESTO NORMATIVO (da LLM):\n${parsed.answer}\n\n`
      : "";
    const sources =
      formattedResults.length > 0
        ? `FONTI TROVATE:\n${formattedResults.join("\n\n")}`
        : "";

    const contextText = [answer, sources].filter(Boolean).join("\n\n").trim();

    console.log(
      `[checks.llm-fallback] LLM search generated ${structuredSources.length} sources for: ${parameterNames}`
    );

    return { contextText, sources: structuredSources };
  } catch (error: any) {
    console.warn(
      `[checks.llm-fallback] LLM regulatory search failed: ${error.message || error}`
    );
    return { contextText: "", sources: [] };
  }
};

/**
 * Parses Tavily API response into structured sources and formatted text.
 */
const parseTavilyResponse = (
  result: {
    answer?: string;
    results?: { content?: string; url?: string; title?: string }[];
  },
  idPrefix: string = "tavily"
): { structuredSources: Source[]; contextText: string; answer: string } => {
  const structuredSources: Source[] = (result.results ?? [])
    .map((item, index) => {
      const content = item.content?.trim();
      if (!content) return null;
      return {
        id: `${idPrefix}-source-${index + 1}`,
        title: item.title || `Fonte normativa ${index + 1}`,
        url: item.url || null,
        excerpt: content.substring(0, 500),
      };
    })
    .filter((item): item is Source => Boolean(item));

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
  const sourcesText =
    formattedResults.length > 0
      ? `FONTI TROVATE:\n${formattedResults.join("\n\n")}`
      : "";
  const contextText = [answer, sourcesText].filter(Boolean).join("\n\n").trim();

  return { structuredSources, contextText, answer: result.answer ?? "" };
};

/**
 * Searches Tavily for regulatory context and returns both formatted text and structured sources.
 * Uses a two-pass strategy: first searches authoritative Italian/EU food safety domains,
 * then falls back to a broader search if insufficient results are found.
 * Falls back to LLM-based search when Tavily API key is not configured.
 *
 * @param analyses - Array of analyses to search for
 * @param querySuffix - Additional terms to add to the search query (e.g., "limiti superfici HACCP")
 * @param options - Optional search configuration
 * @returns Object with context text and structured sources
 */
export const searchRegulatoryContext = async (
  analyses: Analyses[],
  querySuffix: string = "limiti sicurezza alimentare normativa",
  options: TavilySearchOptions = {}
): Promise<TavilySearchResult> => {
  const apiKey = await getTavilyApiKey();
  if (!apiKey) {
    console.log("[checks] No Tavily API key, falling back to LLM regulatory search");
    return searchRegulatoryContextWithLLM(analyses, querySuffix);
  }

  const {
    prioritizeAuthoritativeSources = true,
    additionalDomains = [],
    searchDepth = "advanced",
  } = options;

  try {
    const parameterNames = analyses
      .map((a) => a.parameter)
      .slice(0, 5)
      .join(", ");

    const query = `${parameterNames} ${querySuffix}`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    // Create AbortController with 30 seconds timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      let allSources: Source[] = [];
      let finalAnswer = "";

      // PASS 1: Search authoritative domains first
      if (prioritizeAuthoritativeSources) {
        const domainsToInclude = [
          ...AUTHORITATIVE_FOOD_SAFETY_DOMAINS,
          ...additionalDomains,
        ];

        console.log(
          `[checks] Tavily pass 1: searching ${domainsToInclude.length} authoritative domains for: ${query}`
        );

        const pass1Response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            max_results: 5,
            include_answer: true,
            include_domains: domainsToInclude,
            search_depth: searchDepth,
          }),
          signal: controller.signal,
        });

        if (pass1Response.ok) {
          const pass1Result = (await pass1Response.json()) as {
            answer?: string;
            results?: { content?: string; url?: string; title?: string }[];
          };
          const parsed = parseTavilyResponse(pass1Result, "tavily-auth");
          allSources = parsed.structuredSources;
          finalAnswer = parsed.answer;

          console.log(
            `[checks] Tavily pass 1: found ${allSources.length} authoritative sources`
          );
        } else {
          console.warn(
            `[checks] Tavily pass 1 error: ${pass1Response.status} ${pass1Response.statusText}`
          );
        }
      }

      // PASS 2: Broader search if pass 1 returned < 2 results
      if (allSources.length < 2) {
        console.log(
          `[checks] Tavily pass 2: broadening search (pass 1 had ${allSources.length} results)`
        );

        const pass2Response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            max_results: 5,
            include_answer: !finalAnswer,
            search_depth: "basic",
          }),
          signal: controller.signal,
        });

        if (pass2Response.ok) {
          const pass2Result = (await pass2Response.json()) as {
            answer?: string;
            results?: { content?: string; url?: string; title?: string }[];
          };
          const parsed = parseTavilyResponse(pass2Result, "tavily");

          // Merge results, deduplicating by URL
          const existingUrls = new Set(
            allSources.map((s) => s.url).filter(Boolean)
          );
          for (const source of parsed.structuredSources) {
            if (!source.url || !existingUrls.has(source.url)) {
              allSources.push(source);
              if (source.url) existingUrls.add(source.url);
            }
          }

          if (!finalAnswer && parsed.answer) {
            finalAnswer = parsed.answer;
          }

          console.log(
            `[checks] Tavily pass 2: total sources after merge: ${allSources.length}`
          );
        } else {
          console.warn(
            `[checks] Tavily pass 2 error: ${pass2Response.status}`
          );
        }
      }

      clearTimeout(timeoutId);

      // Sort: authoritative sources first
      allSources.sort((a, b) => {
        const aAuth = isAuthoritativeSource(a.url);
        const bAuth = isAuthoritativeSource(b.url);
        if (aAuth && !bAuth) return -1;
        if (!aAuth && bAuth) return 1;
        return 0;
      });

      // Build final context text from merged sources
      const formattedResults = allSources
        .map((source, index) => {
          return `[FONTE ${index + 1}]
Titolo: ${source.title}
URL: ${source.url || "N/A"}
Contenuto: ${source.excerpt}`;
        });

      const answerText = finalAnswer
        ? `RISPOSTA TAVILY:\n${finalAnswer}\n\n`
        : "";
      const sourcesText =
        formattedResults.length > 0
          ? `FONTI TROVATE:\n${formattedResults.join("\n\n")}`
          : "";
      const contextText = [answerText, sourcesText]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      console.log(
        `[checks] Tavily search found ${allSources.length} total sources for query: ${query}`
      );

      return { contextText, sources: allSources };
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
    const { model } = await createLLM({
      capability: "text",
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
  /** Diagnostic information, especially useful when results are empty */
  diagnostics?: ChecksDiagnostics;
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

  // SEMPRE: verifica CeIRSA come primo controllo per qualsiasi tipo di campione
  const optionsCeirsaCategory = await ceirsaCheck(matrix);
  console.log(
    `[checks.options] CEIRSA category: ${optionsCeirsaCategory?.name ?? "none"}`
  );

  const optionsCeirsaStatusSource: Source = optionsCeirsaCategory
    ? {
        id: `ceirsa-category-${optionsCeirsaCategory.id}`,
        title: `CeIRSA - ${optionsCeirsaCategory.name}`,
        url: null,
        excerpt: `Categoria CeIRSA trovata: ${optionsCeirsaCategory.name} (ID: ${optionsCeirsaCategory.id}). ${
          optionsCeirsaCategory.data?.length ?? 0
        } parametri microbiologici disponibili.`,
      }
    : {
        id: "ceirsa-no-match",
        title: "CeIRSA - Nessuna corrispondenza",
        url: null,
        excerpt: `Nessuna categoria CeIRSA corrispondente trovata per: ${matrix.matrix}${
          matrix.product ? ` (${matrix.product})` : ""
        }. I limiti mostrati provengono da altre fonti normative.`,
      };

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
      return buildResult(
        enrichResultsWithMatrix(
          prependCeirsaSource(allResults, optionsCeirsaStatusSource),
          matrixInfo
        )
      );
    }

    // If no custom categories matched, use environmental swab check with LLM
    console.log(
      `[checks] No matching custom categories found for environmental sample. Using environmental swab check.`
    );
    const rawResults = await environmentalSwabComplianceCheck({
      matrix,
      analyses,
      markdownContent,
      ceirsaCategory: optionsCeirsaCategory,
      ceirsaStatusSource: optionsCeirsaStatusSource,
    });
    const matrixInfo = buildComplianceResultMatrix(
      matrix,
      optionsCeirsaCategory?.name ?? null
    );
    return buildResult(enrichResultsWithMatrix(rawResults, matrixInfo));
  }

  // Track which check paths were attempted (for diagnostics)
  const checkPaths: string[] = [];

  // Run standard checks for non-environmental samples
  // IMPORTANT: Pass pre-extracted matrix/analyses to avoid redundant LLM calls
  const standardResults = await checks(effectiveTextObjects, { matrix, analyses });
  checkPaths.push(`standard_checks: ${standardResults.length} results`);

  // If standard checks returned results, use them
  if (standardResults.length > 0) {
    return buildResult(standardResults);
  }

  // If fallbackToCustom is enabled and standard checks failed, try custom categories
  if (options.fallbackToCustom) {
    const allCustomCategories = await customCheckService.getAllCategories();

    const matchingSampleType = mapMatrixToCustomSampleType(matrix);
    const matchingCategories = allCustomCategories.filter(
      (cat) => cat.sampleType === matchingSampleType
    );
    checkPaths.push(`custom_fallback: tried ${matchingCategories.length} categories for ${matchingSampleType}`);

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

  // Build diagnostics for empty results
  const diagnostics: ChecksDiagnostics = {
    matrixDetected: {
      matrix: matrix.matrix,
      category: matrix.category,
      sampleType: matrix.sampleType,
      product: matrix.product,
    },
    analysesCount: analyses.length,
    analysesParameters: analyses.map((a) => a.parameter),
    checkPathsAttempted: checkPaths,
    usedOcrFallback,
    summary: analyses.length === 0
      ? "Nessuna analisi estratta dal PDF. Il documento potrebbe non contenere dati di analisi di laboratorio."
      : `Estratte ${analyses.length} analisi ma nessun criterio di conformità corrisponde. Matrice classificata come category="${matrix.category}", sampleType="${matrix.sampleType}".`,
  };

  console.log(`[checks] Empty results diagnostics:`, JSON.stringify(diagnostics, null, 2));

  return { ...buildResult([]), diagnostics };
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
