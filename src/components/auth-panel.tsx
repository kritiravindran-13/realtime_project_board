"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";

export function AuthPanel() {
  const {
    user,
    isLoading,
    register,
    login,
    logout,
    registerError,
    loginError,
    isRegistering,
    isLoggingIn,
    isLoggingOut,
  } = useAuth();
  const [username, setUsername] = useState("");

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">
        Checking session…
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Signed in as{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {user.username}
          </span>
        </p>
        <button
          type="button"
          disabled={isLoggingOut}
          onClick={() => void logout()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
        >
          {isLoggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  const busy = isRegistering || isLoggingIn;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Sign in to comment and assign tasks
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Usernames are unique (letters, numbers, <code className="font-mono">_</code>,{" "}
        <code className="font-mono">-</code>).
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const value = username.trim();
          if (!value) return;
          void login(value).catch(() => undefined);
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label
            htmlFor="auth-username"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Username
          </label>
          <input
            id="auth-username"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your-username"
            autoComplete="username"
            disabled={busy}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!username.trim() || busy}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isLoggingIn ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            disabled={!username.trim() || busy}
            onClick={() => {
              const value = username.trim();
              if (!value) return;
              void register(value).catch(() => undefined);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
          >
            {isRegistering ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
      {loginError ? <p className="mt-2 text-xs text-red-600">{loginError}</p> : null}
      {registerError ? (
        <p className="mt-2 text-xs text-red-600">{registerError}</p>
      ) : null}
    </div>
  );
}
