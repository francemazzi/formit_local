import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";

import { RawComplianceResult } from ".";
import { beverageCheckPromptTemplate } from "../../prompts/beverage_check.prompt";
import { getTavilyApiKey } from "../../utils/api-keys.utils";

export interface BeverageRawComplianceResult {
  ragResults: RawComplianceResult[];
  combinedAssessment: RawComplianceResult[];
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
  evaluate(prompt: string): Promise<RawComplianceResult[]>;
}

interface BeveragePromptBuilder {
  build(input: BeverageCheckInput, lawContext: string): Promise<string>;
}

class TavilyLawSearchProvider implements LawSearchProvider {
  async searchLawContext(input: BeverageCheckInput): Promise<string> {
    const apiKey = await getTavilyApiKey();
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
  private readonly parser: JsonOutputParser<RawComplianceResult[]>;

  constructor(
    model: ChatOpenAI,
    parser: JsonOutputParser<RawComplianceResult[]>
  ) {
    this.model = model;
    this.parser = parser;
  }

  async evaluate(prompt: string): Promise<RawComplianceResult[]> {
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

  async check(input: BeverageCheckInput): Promise<RawComplianceResult[]> {
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

const defaultParser = new JsonOutputParser<RawComplianceResult[]>();
const defaultPromptBuilder = new RegulatoryPromptBuilder(
  beverageCheckPromptTemplate,
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
): Promise<RawComplianceResult[]> => {
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
