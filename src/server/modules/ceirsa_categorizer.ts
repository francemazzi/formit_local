import { readFile } from "fs/promises";
import path from "path";

export interface CeirsaCategory {
  id: string;
  name: string;
  data: any[];
}

const resolveLatestCeirsaFile = async (): Promise<string> => {
  const dir = path.join(process.cwd(), "dataset", "ceirsa_backup");
  const fixedFilename = "ceirsa_data_2025-03-19T12-19-43-548Z.json";
  return path.join(dir, fixedFilename);
};

export async function getCategories(): Promise<string[]> {
  try {
    const jsonPath = await resolveLatestCeirsaFile();
    const fileContent = await readFile(jsonPath, "utf-8");
    const categories: CeirsaCategory[] = JSON.parse(fileContent);
    return categories.map((category) => category.name);
  } catch (error) {
    console.error("Error reading CEIRSA data:", error);
    throw new Error("Failed to load CEIRSA categories");
  }
}

export async function getCeirsaCategories(): Promise<CeirsaCategory[]> {
  try {
    const jsonPath = await resolveLatestCeirsaFile();
    const fileContent = await readFile(jsonPath, "utf-8");
    const categories: CeirsaCategory[] = JSON.parse(fileContent);
    return categories;
  } catch (error) {
    console.error("Error reading CEIRSA data:", error);
    throw new Error("Failed to load CEIRSA categories");
  }
}
