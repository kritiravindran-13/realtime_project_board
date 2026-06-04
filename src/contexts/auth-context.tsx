"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "../../lib/shared/auth-user";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  register: (username: string) => Promise<void>;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  registerError: string | null;
  loginError: string | null;
  isRegistering: boolean;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load session");
  }
  const data = (await res.json()) as { user: AuthUser | null };
  return data.user;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return typeof j === "object" && j && "error" in j
    ? String((j as { error: string }).error)
    : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchSession,
  });

  const registerMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, `HTTP ${res.status}`));
      }
      return (await res.json()) as AuthUser;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, `HTTP ${res.status}`));
      }
      return (await res.json()) as AuthUser;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        throw new Error(await readError(res, `HTTP ${res.status}`));
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.removeQueries({ queryKey: ["projects"] });
      queryClient.removeQueries({ queryKey: ["tasks"] });
      queryClient.removeQueries({ queryKey: ["comments"] });
    },
  });

  const register = useCallback(
    async (username: string) => {
      registerMutation.reset();
      await registerMutation.mutateAsync(username);
    },
    [registerMutation],
  );

  const login = useCallback(
    async (username: string) => {
      loginMutation.reset();
      await loginMutation.mutateAsync(username);
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data ?? null,
      isLoading: sessionQuery.isPending,
      register,
      login,
      logout,
      registerError: registerMutation.error?.message ?? null,
      loginError: loginMutation.error?.message ?? null,
      isRegistering: registerMutation.isPending,
      isLoggingIn: loginMutation.isPending,
      isLoggingOut: logoutMutation.isPending,
    }),
    [
      sessionQuery.data,
      sessionQuery.isPending,
      register,
      login,
      logout,
      registerMutation.error,
      loginMutation.error,
      registerMutation.isPending,
      loginMutation.isPending,
      logoutMutation.isPending,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
