import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";

import { ComplianceResult } from ".";

export interface BeverageComplianceResult {
  ragResults: ComplianceResult[];
  combinedAssessment: ComplianceResult[];
}

export interface BeverageCheckInput {
  parameter: string;
  value: string;
  unit?: string | null;
  beverageType: string;
  markdownContent: string;
  lawContext?: string;
}

export interface LawSearchProvider {
  searchLawContext(input: BeverageCheckInput): Promise<string>;
}

export interface ComplianceModel {
  evaluate(prompt: string): Promise<ComplianceResult[]>;
}

interface BeveragePromptBuilder {
  build(input: BeverageCheckInput, lawContext: string): Promise<string>;
}

class TavilyLawSearchProvider implements LawSearchProvider {
  async searchLawContext(input: BeverageCheckInput): Promise<string> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return "";
    }

    try {
      const query = [
        input.parameter,
        input.beverageType,
        "limiti normativi acqua Italia Europa bevande",
      ]
        .filter(Boolean)
        .join(" ");

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
      });

      if (!response.ok) {
        return "";
      }

      const result = (await response.json()) as {
        answer?: string;
        results?: {
          content?: string;
          url?: string;
          title?: string;
        }[];
      };

      const formattedResults = (result.results ?? [])
        .map((item, index) => {
          const content = item.content?.trim();
          if (!content) return null;

          const url = item.url || null;
          const title = item.title || `Fonte ${index + 1}`;

          return `[FONTE ${index + 1}]
Titolo: ${title}
URL: ${url || "N/A"}
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

      return [answer, sources].filter(Boolean).join("\n\n").trim();
    } catch (error) {
      console.warn("Tavily search failed:", error);
      return "";
    }
  }
}

class RegulatoryPromptBuilder implements BeveragePromptBuilder {
  private readonly template: PromptTemplate;
  private readonly formatInstructions: string;

  constructor(template: PromptTemplate, formatInstructions: string) {
    this.template = template;
    this.formatInstructions = formatInstructions;
  }

  async build(input: BeverageCheckInput, lawContext: string): Promise<string> {
    const prompt = await this.template.format({
      parameter: input.parameter,
      value: input.value,
      unit: input.unit ?? "",
      beverageType: input.beverageType,
      lawContext: lawContext || "Nessun contesto normativo trovato",
      markdownContent: input.markdownContent,
      formatInstructions: this.formatInstructions,
    });

    return prompt;
  }
}

class OpenAIBeverageComplianceModel implements ComplianceModel {
  private readonly model: ChatOpenAI;
  private readonly parser: JsonOutputParser<ComplianceResult[]>;

  constructor(model: ChatOpenAI, parser: JsonOutputParser<ComplianceResult[]>) {
    this.model = model;
    this.parser = parser;
  }

  async evaluate(prompt: string): Promise<ComplianceResult[]> {
    try {
      const response = await this.model.invoke(prompt);
      const rawContent = response.content?.toString() ?? "";
      const parsed = await this.parser.parse(rawContent);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch (error) {
      console.warn("Beverage compliance evaluation failed:", error);
      return [];
    }
  }
}

class BeverageCheckService {
  private readonly searchProvider: LawSearchProvider;
  private readonly promptBuilder: BeveragePromptBuilder;
  private readonly complianceModel: ComplianceModel;

  constructor(
    searchProvider: LawSearchProvider,
    promptBuilder: BeveragePromptBuilder,
    complianceModel: ComplianceModel
  ) {
    this.searchProvider = searchProvider;
    this.promptBuilder = promptBuilder;
    this.complianceModel = complianceModel;
  }

  async check(input: BeverageCheckInput): Promise<ComplianceResult[]> {
    const lawContext =
      input.lawContext ?? (await this.searchProvider.searchLawContext(input));

    const prompt = await this.promptBuilder.build(input, lawContext);
    const ragResults = await this.complianceModel.evaluate(prompt);
    const normalizedResults = Array.isArray(ragResults) ? ragResults : [];

    return normalizedResults.map((result) => ({
      ...result,
      sources: Array.isArray(result.sources) ? result.sources : [],
    }));
  }
}

const promptTemplate = PromptTemplate.fromTemplate(
  `
Analizza i seguenti documenti normativi per determinare la conformità del parametro analitico per bevande.

PARAMETRO ANALIZZATO:
- Nome: {parameter}
- Valore rilevato: {value} {unit}
- Tipo bevanda: {beverageType}

DOCUMENTI NORMATIVI LOCALI:
{lawContext}

CONTESTO DOCUMENTO ORIGINALE:
{markdownContent}

COMPITO:
Basandoti ESCLUSIVAMENTE sui documenti normativi forniti, determina se il valore rilevato è conforme.
Cerca riferimenti specifici a:
1. Limiti per il parametro specifico nelle bevande
2. Standard microbiologici per bevande
3. Criteri di sicurezza alimentare per bevande
4. Controlli di qualità specifici
5. Regola LOQ: se il risultato è espresso come "< X" (limite di quantificazione del laboratorio) e lo standard riporta un limite più basso "< Y" con Y < X, considera il campione CONFORME in assenza di evidenza di positività; motiva la decisione indicando che il valore è sotto il LOQ e non indica presenza.

FORMATO RISPOSTA (JSON):
{{
  "name": "Nome del criterio normativo trovato",
  "value": "Limite specifico dal documento",
  "isCheck": true/false,
  "description": "Spiegazione dettagliata basata sui documenti normativi. Cita sempre il documento e la sezione di riferimento. Se applichi la regola LOQ, esplicitalo chiaramente.",
  "sources": [
    {{
      "id": "Identificativo univoco della fonte",
      "title": "Titolo del documento o della sezione",
      "url": "URL della fonte se disponibile, altrimenti null",
      "excerpt": "Estratto rilevante del documento che supporta il check"
    }}
  ]
}}

IMPORTANTE:
- Usa SOLO le informazioni presenti nei documenti forniti
- Se non trovi riferimenti specifici, restituisci array vuoto []
- Includi sempre il riferimento al documento e alla sezione specifica
- NON inventare limiti non presenti nei documenti
- Applica la regola LOQ quando pertinente
- Per ogni check, includi sempre almeno una source con id, title, url (se disponibile) ed excerpt che motiva il risultato
- Se nel contesto normativo sono presenti URL (formato "URL: ..."), includili nella source. Se non sono disponibili, usa null per l'URL
- L'id della source può essere un numero progressivo o un identificativo univoco basato sulla fonte

{formatInstructions}
`.trim()
);

const defaultParser = new JsonOutputParser<ComplianceResult[]>();
const defaultPromptBuilder = new RegulatoryPromptBuilder(
  promptTemplate,
  defaultParser.getFormatInstructions()
);
const defaultComplianceModel = new OpenAIBeverageComplianceModel(
  new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
  }),
  defaultParser
);
const defaultSearchProvider = new TavilyLawSearchProvider();
const defaultService = new BeverageCheckService(
  defaultSearchProvider,
  defaultPromptBuilder,
  defaultComplianceModel
);

const beverageCheck = async (
  input: BeverageCheckInput
): Promise<ComplianceResult[]> => {
  return defaultService.check(input);
};

export {
  beverageCheck,
  BeverageCheckService,
  TavilyLawSearchProvider,
  RegulatoryPromptBuilder,
  OpenAIBeverageComplianceModel,
  defaultPromptBuilder,
  defaultSearchProvider,
  defaultComplianceModel,
};
