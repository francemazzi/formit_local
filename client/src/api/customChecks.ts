import axios from "axios";
import type {
  CustomCheckCategory,
  CustomCheckParameter,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateParameterInput,
  UpdateParameterInput,
  ImportCategoryInput,
} from "../types";

// In development, use proxy (empty string). In production, use full URL
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ========================================
// Category API
// ========================================

export const categoriesApi = {
  getAll: async (): Promise<CustomCheckCategory[]> => {
    const response = await api.get<CustomCheckCategory[]>("/custom-checks/categories");
    return response.data;
  },

  getById: async (id: string): Promise<CustomCheckCategory> => {
    const response = await api.get<CustomCheckCategory>(`/custom-checks/categories/${id}`);
    return response.data;
  },

  create: async (data: CreateCategoryInput): Promise<CustomCheckCategory> => {
    const response = await api.post<CustomCheckCategory>("/custom-checks/categories", data);
    return response.data;
  },

  update: async (id: string, data: UpdateCategoryInput): Promise<CustomCheckCategory> => {
    const response = await api.put<CustomCheckCategory>(`/custom-checks/categories/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/custom-checks/categories/${id}`);
  },

  import: async (data: ImportCategoryInput): Promise<CustomCheckCategory> => {
    const response = await api.post<CustomCheckCategory>("/custom-checks/import", data);
    return response.data;
  },

  export: async (id: string): Promise<ImportCategoryInput> => {
    const response = await api.get<ImportCategoryInput>(`/custom-checks/export/${id}`);
    return response.data;
  },
};

// ========================================
// Parameter API
// ========================================

export const parametersApi = {
  create: async (categoryId: string, data: CreateParameterInput): Promise<CustomCheckParameter> => {
    const response = await api.post<CustomCheckParameter>(
      `/custom-checks/categories/${categoryId}/parameters`,
      data
    );
    return response.data;
  },

  update: async (id: string, data: UpdateParameterInput): Promise<CustomCheckParameter> => {
    const response = await api.put<CustomCheckParameter>(`/custom-checks/parameters/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/custom-checks/parameters/${id}`);
  },
};

