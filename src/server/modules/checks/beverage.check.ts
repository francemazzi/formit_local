import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { RawComplianceResult, searchRegulatoryContext } from ".";
import { createLLM } from "../../utils/llm-factory";
import { beverageCheckPromptTemplate } from "../../prompts/beverage_check.prompt";

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
    const analyses = [
      {
        parameter: input.parameter,
        result: input.value,
        um_result: input.unit || null,
      },
    ];

    const querySuffix = `${input.beverageType} limiti normativi acqua Italia Europa bevande`;
    const result = await searchRegulatoryContext(analyses as any, querySuffix);
    return result.contextText;
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
  private readonly parser: JsonOutputParser<RawComplianceResult[]>;

  constructor(parser: JsonOutputParser<RawComplianceResult[]>) {
    this.parser = parser;
  }

  async evaluate(prompt: string): Promise<RawComplianceResult[]> {
    try {
      const { model } = await createLLM({ capability: "text", temperature: 0 });
      const response = await model.invoke(prompt);
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
const defaultComplianceModel = new OpenAIBeverageComplianceModel(defaultParser);
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
