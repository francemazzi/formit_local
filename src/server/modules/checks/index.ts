import { MatrixExtractionResult } from "../extract_matrix_from_text";

export interface Source {
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
}

export interface ComplianceResult {
  name: string;
  value: string;
  isCheck: boolean;
  description: string;
  sources: Source[];
}

export const checks = async (matrix: MatrixExtractionResult) => {};
