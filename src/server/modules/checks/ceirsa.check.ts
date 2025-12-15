import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";

import {
  getCeirsaCategories,
  type CeirsaCategory,
} from "../ceirsa_categorizer";
import { MatrixExtractionResult } from "../extract_matrix_from_text";
import { Analyses } from "../extract_analyses_from_text";
import { ComplianceResult } from "./index";

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

const normalizeUnit = (unitText: string): string => {
  return unitText.toLowerCase().replace(/\s+/g, "").replace(/\./g, "").trim();
};

const extractUnitFromLimit = (limitText: string): string | null => {
  if (!limitText) return null;
  const match = limitText.match(/\(([^)]+)\)/);
  return match?.[1]?.trim() ?? null;
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
): {
  minInclusive: number | null;
  maxExclusive: number | null;
} | null => {
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

const decideCompliance = (input: {
  resultRaw: string;
  measuredUnit: string;
  satisfactoryValue?: string;
  acceptableValue?: string;
  unsatisfactoryValue?: string;
}): CeirsaDecision => {
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

  const measuredUnitNorm = normalizeUnit(input.measuredUnit ?? "");
  const ceirsaUnit =
    extractUnitFromLimit(sat) ??
    extractUnitFromLimit(acc) ??
    extractUnitFromLimit(unsat);
  if (ceirsaUnit) {
    const ceirsaUnitNorm = normalizeUnit(ceirsaUnit);
    if (
      measuredUnitNorm &&
      ceirsaUnitNorm &&
      measuredUnitNorm !== ceirsaUnitNorm
    ) {
      return {
        band: "unknown",
        isCheck: null,
        appliedLimit: null,
        rationale:
          "Units are not comparable between measured result and CEIRSA limits (best-effort).",
      };
    }
  }

  const isAbsent =
    result.includes("assente") ||
    result.includes("non rilevato") ||
    result === "nr";
  const isDetected = result.includes("rilevato") || result === "r";

  if (sat.toLowerCase().includes("assente") && isDetected) {
    return {
      band: "unsatisfactory",
      isCheck: false,
      appliedLimit: sat,
      rationale:
        "Il criterio richiede assenza ma il risultato indica rilevazione/presenza.",
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

  const numeric = parseMeasuredNumeric(result);
  if (numeric === null) {
    return {
      band: "unknown",
      isCheck: null,
      appliedLimit: null,
      rationale: "Risultato non numerico e non gestibile con regole semplici.",
    };
  }

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
      const okMin =
        accRange.minInclusive === null
          ? true
          : numeric >= accRange.minInclusive;
      const okMax =
        accRange.maxExclusive === null ? true : numeric < accRange.maxExclusive;
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
    rationale:
      "Impossibile classificare in modo deterministico con i limiti disponibili.",
  };
};

const normalizeParameterName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isParameterMatching = (
  analysisParam: string,
  ceirsaParam: string
): boolean => {
  const normalizedAnalysis = normalizeParameterName(analysisParam);
  const normalizedCeirsa = normalizeParameterName(ceirsaParam);

  if (normalizedAnalysis === normalizedCeirsa) return true;

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

  const normalizedCeirsaLimits = [
    input.satisfactoryValue &&
      `Soddisfacente: ${normalizeLimit(input.satisfactoryValue)}`,
    input.acceptableValue &&
      `Accettabile: ${normalizeLimit(input.acceptableValue)}`,
    input.unsatisfactoryValue &&
      `Insoddisfacente: ${normalizeLimit(input.unsatisfactoryValue)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const decision = decideCompliance({
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
    normalizedCeirsaLimits:
      normalizedCeirsaLimits || "Nessun limite specificato",
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
  parser: JsonOutputParser<ComplianceResult[]>
): Promise<ComplianceResult[]> => {
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
  parser: JsonOutputParser<ComplianceResult[]>
): Promise<ComplianceResult[]> => {
  const prompt = await buildPrompt(input, template, formatInstructions);
  const results = await evaluateCompliance(prompt, model, parser);
  const normalizedResults = Array.isArray(results) ? results : [];

  const decision = decideCompliance({
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
    const base: ComplianceResult =
      normalizedResults[0] ??
      ({
        name: input.ceirsaParameter,
        value: decision.appliedLimit,
        isCheck: decision.isCheck,
        description: "",
        sources: [],
      } satisfies ComplianceResult);

    const enforced: ComplianceResult = {
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

const promptTemplate = PromptTemplate.fromTemplate(
  `
Analizza i seguenti criteri normativi CEIRSA per determinare la conformità del parametro analitico.

PARAMETRO ANALIZZATO:
- Nome: {parameter}
- Risultato: {result} {unit}
- Metodo di analisi utilizzato: {method}

CRITERI NORMATIVI CEIRSA:
- Categoria CEIRSA: {categoryName} (ID: {categoryId})
- Parametro CEIRSA: {ceirsaParameter}
- Criterio microbiologico: {microbiologicalCriterion}
- Metodo di analisi normativo: {analysisMethod}
- Limiti normativi:
{ceirsaLimits}
- Limiti normativi (normalizzati solo per chiarezza; i valori originali restano invariati):
{normalizedCeirsaLimits}
- Riferimenti bibliografici: {bibliographicReferences}
- Note: {notes}

CONTESTO DOCUMENTO ORIGINALE:
{markdownContent}

AUTO-VALUTAZIONE (DA SEGUIRE. Se non puoi confrontare unità/valori con certezza, restituisci []):
- Fascia calcolata: {autoBand}
- isCheck calcolato: {autoIsCheck}
- Limite da riportare in value (testo originale): {autoAppliedLimit}
- Motivazione: {autoRationale}

COMPITO:
Basandoti ESCLUSIVAMENTE sui criteri normativi CEIRSA forniti, determina se il valore rilevato è conforme.

REGOLE DI DECISIONE (OBBLIGATORIE):
- Devi classificare il risultato in UNA delle 3 fasce: "soddisfacente", "accettabile", "insoddisfacente".
- **CONFORMITÀ**:
  - Se la fascia è "soddisfacente" ⇒ **isCheck = true**
  - Se la fascia è "accettabile" ⇒ **isCheck = true** (conforme ma in fascia di attenzione)
  - Se la fascia è "insoddisfacente" ⇒ **isCheck = false**
- **NON dichiarare "insoddisfacente"** se il valore è chiaramente sotto la soglia "insoddisfacente" (quando presente).
- Se nei criteri CEIRSA manca la fascia "accettabile", usa solo "soddisfacente" vs "insoddisfacente" se possibile; altrimenti spiega perché non determinabile e restituisci [].

INTERPRETAZIONE VALORI (OBBLIGATORIA):
- Interpreta correttamente notazioni tipo "< 100", "≤ 10", "≥ 10", "Assente", "Non rilevato", "Rilevato".
- Se il criterio richiede "Assente" e il risultato è "Rilevato" ⇒ **insoddisfacente**.
- Se il risultato è sotto LOQ ("< X") e i limiti indicano una soglia più bassa, **non inventare positività**: valuta sulla base di quanto disponibile e motivando.

UNITÀ DI MISURA:
- Se unità tra risultato e limite non sono confrontabili/conversione non possibile con certezza, NON indovinare: restituisci [].

FORMATO RISPOSTA (JSON) - DEVI RESTITUIRE UN ARRAY CON 1 ELEMENTO:
[
  {{
    "name": "Deve essere ESATTAMENTE il nome del parametro CEIRSA (ceirsaParameter)",
    "value": "Deve essere il TESTO ESATTO del limite usato per decidere (es. '<102 (ufc/g)' oppure '10≤ x <102 (ufc/g)' oppure '≥102 (ufc/g)' oppure 'Assente (...)')",
    "isCheck": true/false,
    "description": "Spiegazione breve e precisa: indica la fascia (soddisfacente/accettabile/insoddisfacente), confronta numeri e operatori, e ribadisci che 'accettabile' è conforme ma in attenzione.",
    "sources": [
      {{
        "id": "ceirsa-{categoryId}-{ceirsaParameter}",
        "title": "Limiti normativi CEIRSA per {ceirsaParameter}",
        "url": null,
        "excerpt": "Riporta esattamente i limiti CEIRSA usati (incluso soddisfacente/accettabile/insoddisfacente)"
      }}
    ]
  }}
]

IMPORTANTE:
- Usa SOLO le informazioni presenti nei criteri CEIRSA forniti
- Se non trovi un parametro corrispondente o criteri chiari, restituisci array vuoto []
- Considera attentamente le differenze nelle unità di misura e converti quando possibile
- Interpreta correttamente i valori numerici e le notazioni (es. "< 10", "≥ 10", "Assente")
- Per ogni check, includi sempre almeno una source con id, title, url (null) ed excerpt
- L'id della source deve essere nel formato: ceirsa-{categoryId}-{parameter} o ceirsa-notes-{categoryId}-{parameter}
- Se ci sono riferimenti bibliografici, includili nella source. Se ci sono note, includile come source separata

{formatInstructions}
`.trim()
);

const defaultParser = new JsonOutputParser<ComplianceResult[]>();
const defaultModel = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
});

export const ceirsaComplianceCheck = async (
  category: CeirsaCategory,
  analyses: Analyses[],
  markdownContent: string
): Promise<ComplianceResult[]> => {
  if (!category || !category.data || !Array.isArray(category.data)) {
    return [];
  }

  if (!analyses || analyses.length === 0) {
    return [];
  }

  const results: ComplianceResult[] = [];
  const formatInstructions = defaultParser.getFormatInstructions();

  for (const analysis of analyses) {
    const matchingParameter = category.data.find(
      (param: any) =>
        param.parameter &&
        isParameterMatching(analysis.parameter, param.parameter)
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
