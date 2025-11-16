import { JsonOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { extractMatrixPrompt } from "../prompts/extract_matrix_from_text";
import { LangChainMessageUtils } from "../utils/langchain_message.utils";

import { ExtractedTextEntry } from "./extract_text_from_pdf";

export interface MatrixExtractionResult {
  matrix: string;
  description: string | null;
  product: string | null;
  category: "food" | "beverage" | "other";
  ceirsa_category: string | null;
  specialFeatures: string[];
}

type RawMatrixExtractionResult = Partial<
  Omit<MatrixExtractionResult, "specialFeatures">
> & {
  specialFeatures?: string[] | string | null;
};

interface CategoryRepository {
  getCategories(): Promise<string[]>;
}

interface PromptBuilder {
  build(markdownContent: string, categories: string[]): string;
}

interface MatrixExtractionDependencies {
  model: ChatOpenAI;
  categoryRepository: CategoryRepository;
  promptBuilder: PromptBuilder;
  parser: JsonOutputParser<RawMatrixExtractionResult>;
}

const DEFAULT_MATRIX_RESULT: MatrixExtractionResult = {
  matrix: "Tampone ambientale",
  description: null,
  product: null,
  category: "other",
  ceirsa_category: null,
  specialFeatures: [],
};

const buildDefaultMatrixResult = (): MatrixExtractionResult => ({
  matrix: DEFAULT_MATRIX_RESULT.matrix,
  description: DEFAULT_MATRIX_RESULT.description,
  product: DEFAULT_MATRIX_RESULT.product,
  category: DEFAULT_MATRIX_RESULT.category,
  ceirsa_category: DEFAULT_MATRIX_RESULT.ceirsa_category,
  specialFeatures: [],
});

const matrixParser = new JsonOutputParser<RawMatrixExtractionResult>();

const promptTemplate = `${
  extractMatrixPrompt.prompt
}${matrixParser.getFormatInstructions()}`;

const DEFAULT_DATASET_PATH =
  process.env.CEIRSA_DATASET_PATH ??
  path.resolve(process.cwd(), "dataset", "ceirsa_backup", "latest.json");

const createCeirsaCategoryRepository = (
  datasetPath: string = DEFAULT_DATASET_PATH
): CategoryRepository => {
  let cachedCategories: string[] | null = null;

  const loadCategoriesFromDisk = async (): Promise<string[]> => {
    try {
      const rawFile = await readFile(datasetPath, "utf8");
      const parsedContent = JSON.parse(rawFile);

      if (!Array.isArray(parsedContent)) {
        return [];
      }

      return parsedContent
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return undefined;
          }

          const { name } = entry as { name?: unknown };

          return typeof name === "string" ? name.trim() : undefined;
        })
        .filter((name): name is string => Boolean(name));
    } catch {
      return [];
    }
  };

  const getCategories = async (): Promise<string[]> => {
    if (cachedCategories) {
      return cachedCategories;
    }

    cachedCategories = await loadCategoriesFromDisk();
    return cachedCategories;
  };

  return { getCategories };
};

const createMatrixPromptBuilder = (template: string): PromptBuilder => {
  const build = (markdownContent: string, categories: string[]): string => {
    const categoriesBlock =
      categories.length > 0
        ? categories
            .map((category, index) => `${index + 1}. ${category}`)
            .join("\n")
        : "Nessuna categoria disponibile";

    return template
      .replace("{ceirsaCategories}", categoriesBlock)
      .replace("{markdownContent}", markdownContent);
  };

  return { build };
};

const composeMarkdownPayload = (textObjects: ExtractedTextEntry[]): string => {
  return textObjects
    .slice()
    .sort((left, right) => left.letter_number - right.letter_number)
    .map((entry) => entry.text_extracted?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCategory = (
  value: unknown
): MatrixExtractionResult["category"] => {
  if (value === "food" || value === "beverage" || value === "other") {
    return value;
  }

  return DEFAULT_MATRIX_RESULT.category;
};

const normalizeSpecialFeatures = (
  value: RawMatrixExtractionResult["specialFeatures"]
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));
  }

  const singleValue = normalizeString(value);
  return singleValue ? [singleValue] : [];
};

const normalizeResponse = (
  response: RawMatrixExtractionResult | null | undefined
): MatrixExtractionResult => {
  if (!response || typeof response !== "object") {
    return buildDefaultMatrixResult();
  }

  const matrix =
    normalizeString(response.matrix) ?? DEFAULT_MATRIX_RESULT.matrix;
  const description = normalizeString(response.description);
  const product = normalizeString(response.product);
  const category = normalizeCategory(response.category);
  const ceirsaCategory = normalizeString(response.ceirsa_category);
  const specialFeatures = normalizeSpecialFeatures(response.specialFeatures);

  return {
    matrix,
    description,
    product,
    category,
    ceirsa_category: ceirsaCategory,
    specialFeatures,
  };
};

const createMatrixExtractionService = (
  dependencies: MatrixExtractionDependencies
) => {
  const extract = async (
    textObjects: ExtractedTextEntry[]
  ): Promise<MatrixExtractionResult> => {
    if (!Array.isArray(textObjects) || textObjects.length === 0) {
      return buildDefaultMatrixResult();
    }

    const markdownContent = composeMarkdownPayload(textObjects);

    if (!markdownContent) {
      return buildDefaultMatrixResult();
    }

    try {
      const categories = await dependencies.categoryRepository.getCategories();
      const prompt = dependencies.promptBuilder.build(
        markdownContent,
        categories
      );
      const response = await dependencies.model.invoke(prompt);
      const resolvedContent =
        LangChainMessageUtils.extractTextContent(response);
      const parsed = await dependencies.parser.parse(resolvedContent);
      return normalizeResponse(parsed);
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Unknown error";
      console.warn(`Matrix extraction failed: ${failure}`);
      return buildDefaultMatrixResult();
    }
  };

  return { extract };
};

const defaultDependencies: MatrixExtractionDependencies = {
  model: new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.1,
  }),
  categoryRepository: createCeirsaCategoryRepository(),
  promptBuilder: createMatrixPromptBuilder(promptTemplate),
  parser: matrixParser,
};

const matrixExtractionService =
  createMatrixExtractionService(defaultDependencies);

export const extractMatrixFromText = (
  textObjects: ExtractedTextEntry[]
): Promise<MatrixExtractionResult> => {
  return matrixExtractionService.extract(textObjects);
};
