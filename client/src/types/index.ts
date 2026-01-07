// ========================================
// Enums
// ========================================

export type CustomSampleType = 
  | "FOOD_PRODUCT"
  | "BEVERAGE"
  | "ENVIRONMENTAL_SWAB"
  | "PERSONNEL_SWAB"
  | "OTHER";

export type CriterionType = "HYGIENE" | "SAFETY";

// ========================================
// Models
// ========================================

export interface CustomCheckParameter {
  id: string;
  createdAt: string;
  updatedAt: string;
  categoryId: string;
  parameter: string;
  analysisMethod: string | null;
  criterionType: CriterionType;
  satisfactoryValue: string | null;
  acceptableValue: string | null;
  unsatisfactoryValue: string | null;
  bibliographicReferences: string | null;
  notes: string | null;
}

export interface CustomCheckCategory {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string | null;
  sampleType: CustomSampleType;
  parameters: CustomCheckParameter[];
}

// ========================================
// Input Types
// ========================================

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
  sampleType?: CustomSampleType;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  sampleType?: CustomSampleType;
}

export interface CreateParameterInput {
  parameter: string;
  analysisMethod?: string | null;
  criterionType?: CriterionType;
  satisfactoryValue?: string | null;
  acceptableValue?: string | null;
  unsatisfactoryValue?: string | null;
  bibliographicReferences?: string | null;
  notes?: string | null;
}

export interface UpdateParameterInput {
  parameter?: string;
  analysisMethod?: string | null;
  criterionType?: CriterionType;
  satisfactoryValue?: string | null;
  acceptableValue?: string | null;
  unsatisfactoryValue?: string | null;
  bibliographicReferences?: string | null;
  notes?: string | null;
}

export interface ImportCategoryInput extends CreateCategoryInput {
  parameters: CreateParameterInput[];
}

// ========================================
// Display Helpers
// ========================================

export const SAMPLE_TYPE_LABELS: Record<CustomSampleType, string> = {
  FOOD_PRODUCT: "🍕 Alimento",
  BEVERAGE: "🥤 Bevanda",
  ENVIRONMENTAL_SWAB: "🧪 Tampone Ambientale",
  PERSONNEL_SWAB: "👤 Tampone Operatore",
  OTHER: "📦 Altro",
};

export const CRITERION_TYPE_LABELS: Record<CriterionType, string> = {
  HYGIENE: "Igiene",
  SAFETY: "Sicurezza",
};

