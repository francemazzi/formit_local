import { MatrixExtractionResult } from "../extract_matrix_from_text";

export interface ComplianceResult {
  name: string;
  value: string;
  isCheck: boolean;
  description: string;
}

export interface ComplianceSearchResult {
  [parameter: string]: ComplianceResult[];
}

export const checks = async (matrix: MatrixExtractionResult) => {};
