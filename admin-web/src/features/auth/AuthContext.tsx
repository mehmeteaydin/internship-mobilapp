import React, { createContext, useContext, useEffect, useState } from "react";
import { adminApi, ApiClientError } from "@/lib/api/client";
import type { AdminUser } from "@/lib/api/types";

interface AuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .me()
      .then((user) => setAdmin(user))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await adminApi.login(email, password);
    setAdmin(res.admin);
  };

  const logout = async () => {
    await adminApi.logout();
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiClientError) {
    return `${err.envelope.code}: ${err.envelope.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Beklenmeyen bir hata oluştu.";
}
