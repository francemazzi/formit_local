import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { authApi, type User, type QuotaInfo } from "../api/auth";

interface AuthContextValue {
  user: User | null;
  quota: QuotaInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.user);
      setQuota(response.quota || null);
    } catch {
      setUser(null);
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const response = await authApi.me();
        setUser(response.user);
        setQuota(response.quota || null);
      } catch {
        try {
          const refreshResponse = await authApi.refresh();
          setUser(refreshResponse.user);
          setQuota(refreshResponse.quota || null);
        } catch {
          setUser(null);
          setQuota(null);
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      setQuota(null);
    };
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setUser(response.user);
    setQuota(response.quota || null);
  };

  const register = async (email: string, password: string) => {
    const response = await authApi.register(email, password);
    setUser(response.user);
    setQuota(response.quota || null);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    setQuota(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        quota,
        isLoading,
        isAuthenticated: !!user,
        isAdmin: user?.role === "ADMIN",
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
