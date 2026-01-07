import {
  PrismaClient,
  CustomCheckCategory,
  CustomCheckParameter,
  CustomSampleType,
  CriterionType,
} from "@prisma/client";

import { getDatabaseClient } from "./prisma.client";

// ========================================
// Types
// ========================================

export interface CreateCategoryInput {
  name: string;
  description?: string | null | undefined;
  sampleType?: CustomSampleType | undefined;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null | undefined;
  sampleType?: CustomSampleType | undefined;
}

export interface CreateParameterInput {
  categoryId: string;
  parameter: string;
  analysisMethod?: string | null | undefined;
  criterionType?: CriterionType | undefined;
  satisfactoryValue?: string | null | undefined;
  acceptableValue?: string | null | undefined;
  unsatisfactoryValue?: string | null | undefined;
  bibliographicReferences?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface UpdateParameterInput {
  parameter?: string;
  analysisMethod?: string | null | undefined;
  criterionType?: CriterionType | undefined;
  satisfactoryValue?: string | null | undefined;
  acceptableValue?: string | null | undefined;
  unsatisfactoryValue?: string | null | undefined;
  bibliographicReferences?: string | null | undefined;
  notes?: string | null | undefined;
}

export type CategoryWithParameters = CustomCheckCategory & {
  parameters: CustomCheckParameter[];
};

// ========================================
// Utility Functions
// ========================================

/**
 * Removes undefined values from an object, keeping null values.
 * Prisma requires null instead of undefined for nullable fields.
 */
const removeUndefined = <T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], undefined> } => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
};

// ========================================
// Service Implementation
// ========================================

class CustomCheckService {
  private getPrisma(): PrismaClient {
    return getDatabaseClient();
  }

  // ========================================
  // Category Operations
  // ========================================

  async createCategory(input: CreateCategoryInput): Promise<CustomCheckCategory> {
    return this.getPrisma().customCheckCategory.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        sampleType: input.sampleType ?? "FOOD_PRODUCT",
      },
    });
  }

  async getAllCategories(): Promise<CategoryWithParameters[]> {
    return this.getPrisma().customCheckCategory.findMany({
      include: { parameters: true },
      orderBy: { name: "asc" },
    });
  }

  async getCategoryById(id: string): Promise<CategoryWithParameters | null> {
    return this.getPrisma().customCheckCategory.findUnique({
      where: { id },
      include: { parameters: true },
    });
  }

  async getCategoryByName(name: string): Promise<CategoryWithParameters | null> {
    return this.getPrisma().customCheckCategory.findUnique({
      where: { name },
      include: { parameters: true },
    });
  }

  async updateCategory(
    id: string,
    input: UpdateCategoryInput
  ): Promise<CustomCheckCategory> {
    const data = removeUndefined({
      name: input.name,
      description: input.description,
      sampleType: input.sampleType,
    });
    
    return this.getPrisma().customCheckCategory.update({
      where: { id },
      data,
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.getPrisma().customCheckCategory.delete({ where: { id } });
  }

  // ========================================
  // Parameter Operations
  // ========================================

  async addParameter(input: CreateParameterInput): Promise<CustomCheckParameter> {
    return this.getPrisma().customCheckParameter.create({
      data: {
        categoryId: input.categoryId,
        parameter: input.parameter,
        analysisMethod: input.analysisMethod ?? null,
        criterionType: input.criterionType ?? "HYGIENE",
        satisfactoryValue: input.satisfactoryValue ?? null,
        acceptableValue: input.acceptableValue ?? null,
        unsatisfactoryValue: input.unsatisfactoryValue ?? null,
        bibliographicReferences: input.bibliographicReferences ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  async getParameterById(id: string): Promise<CustomCheckParameter | null> {
    return this.getPrisma().customCheckParameter.findUnique({
      where: { id },
    });
  }

  async getParametersByCategory(categoryId: string): Promise<CustomCheckParameter[]> {
    return this.getPrisma().customCheckParameter.findMany({
      where: { categoryId },
      orderBy: { parameter: "asc" },
    });
  }

  async updateParameter(
    id: string,
    input: UpdateParameterInput
  ): Promise<CustomCheckParameter> {
    const data = removeUndefined({
      parameter: input.parameter,
      analysisMethod: input.analysisMethod,
      criterionType: input.criterionType,
      satisfactoryValue: input.satisfactoryValue,
      acceptableValue: input.acceptableValue,
      unsatisfactoryValue: input.unsatisfactoryValue,
      bibliographicReferences: input.bibliographicReferences,
      notes: input.notes,
    });
    
    return this.getPrisma().customCheckParameter.update({
      where: { id },
      data,
    });
  }

  async deleteParameter(id: string): Promise<void> {
    await this.getPrisma().customCheckParameter.delete({ where: { id } });
  }

  // ========================================
  // Bulk Operations
  // ========================================

  async importCategory(
    categoryData: CreateCategoryInput & { parameters: Omit<CreateParameterInput, "categoryId">[] }
  ): Promise<CategoryWithParameters> {
    const category = await this.createCategory({
      name: categoryData.name,
      description: categoryData.description ?? null,
      sampleType: categoryData.sampleType,
    });

    for (const paramData of categoryData.parameters) {
      await this.addParameter({
        categoryId: category.id,
        parameter: paramData.parameter,
        analysisMethod: paramData.analysisMethod ?? null,
        criterionType: paramData.criterionType,
        satisfactoryValue: paramData.satisfactoryValue ?? null,
        acceptableValue: paramData.acceptableValue ?? null,
        unsatisfactoryValue: paramData.unsatisfactoryValue ?? null,
        bibliographicReferences: paramData.bibliographicReferences ?? null,
        notes: paramData.notes ?? null,
      });
    }

    return this.getCategoryById(category.id) as Promise<CategoryWithParameters>;
  }

  async exportCategory(categoryId: string): Promise<{
    name: string;
    description: string | null;
    sampleType: CustomSampleType;
    parameters: Omit<CustomCheckParameter, "id" | "createdAt" | "updatedAt" | "categoryId">[];
  } | null> {
    const category = await this.getCategoryById(categoryId);
    if (!category) return null;

    return {
      name: category.name,
      description: category.description,
      sampleType: category.sampleType,
      parameters: category.parameters.map((p) => ({
        parameter: p.parameter,
        analysisMethod: p.analysisMethod,
        criterionType: p.criterionType,
        satisfactoryValue: p.satisfactoryValue,
        acceptableValue: p.acceptableValue,
        unsatisfactoryValue: p.unsatisfactoryValue,
        bibliographicReferences: p.bibliographicReferences,
        notes: p.notes,
      })),
    };
  }
}

// Singleton instance
export const customCheckService = new CustomCheckService();

export { CustomCheckService };

