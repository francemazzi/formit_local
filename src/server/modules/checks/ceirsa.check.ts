import {
  getCeirsaCategories,
  type CeirsaCategory,
} from "../ceirsa_categorizer";
import { MatrixExtractionResult } from "../extract_matrix_from_text";

interface CeirsaCategoryProvider {
  loadAll(): Promise<CeirsaCategory[]>;
}

const createFileSystemCeirsaCategoryProvider = (): CeirsaCategoryProvider => ({
  loadAll: () => getCeirsaCategories(),
});

const normalizeValue = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
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
    if (!normalizedTarget) {
      return null;
    }

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

const ceirsaCheck = async (
  matrix: MatrixExtractionResult
): Promise<CeirsaCategory | null> => {
  return categoryMatcher.findByMatrix(matrix);
};

export {
  ceirsaCheck,
  createCeirsaCategoryMatcher,
  createFileSystemCeirsaCategoryProvider,
};
