import { useState, useEffect, useCallback } from "react";
import { api, setTenantId, getTenantId, clearTenantId } from "../lib/api";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setTenant: (tenantId: string) => void;
  clearTenant: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if we have a session by trying to fetch a protected endpoint
    // Since cookies are httpOnly, we can't read the token directly.
    // We'll rely on API responses to determine auth state.
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await api.post<User>("/auth/login", { email, password });
      if (res.success) {
        setUser(res.data);
        return { success: true };
      }
      return { success: false, error: res.error.message };
    } catch (err: any) {
      return { success: false, error: err?.error?.message || "Login failed" };
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const res = await api.post<User>("/auth/register", { name, email, password });
      if (res.success) {
        setUser(res.data);
        return { success: true };
      }
      return { success: false, error: res.error.message };
    } catch (err: any) {
      return { success: false, error: err?.error?.message || "Registration failed" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore errors during logout
    }
    setUser(null);
    clearTenantId();
  }, []);

  const setTenant = useCallback((tenantId: string) => {
    setTenantId(tenantId);
  }, []);

  const clearTenant = useCallback(() => {
    clearTenantId();
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    setTenant: setTenant,
    clearTenant: clearTenant,
  };
}