import { apiClient } from "./client";

export interface User {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
  plan: "FREE" | "PRO" | "ENTERPRISE";
  createdAt?: string;
}

export interface QuotaInfo {
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  allowed: boolean;
}

export interface AuthResponse {
  user: User;
  quota?: QuotaInfo;
}

export interface AdminUser extends User {
  uploadsThisWeek: number;
  quotaLimit: number;
}

export interface AdminStats {
  totalUsers: number;
  totalExtractions: number;
  weeklyExtractions: number;
  planDistribution: { plan: string; count: number }[];
}

export const authApi = {
  register: async (
    email: string,
    password: string
  ): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/register", {
      email,
      password,
    });
    return response.data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post("/auth/logout");
  },

  refresh: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/refresh");
    return response.data;
  },

  me: async (): Promise<AuthResponse> => {
    const response = await apiClient.get<AuthResponse>("/auth/me");
    return response.data;
  },
};

export const adminApi = {
  getUsers: async (): Promise<{ users: AdminUser[] }> => {
    const response = await apiClient.get<{ users: AdminUser[] }>(
      "/admin/users"
    );
    return response.data;
  },

  updateUserPlan: async (
    userId: string,
    plan: string
  ): Promise<{ id: string; email: string; plan: string }> => {
    const response = await apiClient.put(`/admin/users/${userId}/plan`, {
      plan,
    });
    return response.data;
  },

  getStats: async (): Promise<AdminStats> => {
    const response = await apiClient.get<AdminStats>("/admin/stats");
    return response.data;
  },
};
