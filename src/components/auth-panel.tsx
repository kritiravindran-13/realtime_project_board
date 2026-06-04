"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { isValidUsernameFormat, normalizeUsername } from "../../lib/shared/auth-user";
import { useAuth } from "@/contexts/auth-context";

type AuthMode = "signin" | "register";

async function checkUsernameAvailable(username: string): Promise<boolean> {
  const res = await fetch(
    `/api/auth/check-username?username=${encodeURIComponent(username)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { available?: boolean; valid?: boolean };
  return Boolean(data.valid && data.available);
}

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
  const [mode, setMode] = useState<AuthMode>("signin");

  const trimmed = normalizeUsername(username);
  const formatValid = trimmed.length > 0 && isValidUsernameFormat(trimmed);

  const availabilityQuery = useQuery({
    queryKey: ["auth", "check-username", trimmed],
    queryFn: () => checkUsernameAvailable(trimmed),
    enabled: mode === "register" && formatValid,
    staleTime: 10_000,
  });

  const usernameTaken =
    mode === "register" &&
    formatValid &&
    availabilityQuery.isSuccess &&
    availabilityQuery.data === false;

  const usernameAvailable =
    mode === "register" &&
    formatValid &&
    availabilityQuery.isSuccess &&
    availabilityQuery.data === true;

  const canRegister =
    formatValid &&
    !usernameTaken &&
    !availabilityQuery.isFetching &&
    (availabilityQuery.isSuccess ? availabilityQuery.data === true : false);

  const usernameHint = useMemo(() => {
    if (!trimmed) return null;
    if (!formatValid) {
      return "Use 2–32 characters: letters, numbers, _ or -.";
    }
    if (mode === "register") {
      if (availabilityQuery.isFetching) return "Checking availability…";
      if (usernameTaken) return "That username is already taken.";
      if (usernameAvailable) return "Username is available.";
    }
    return null;
  }, [
    trimmed,
    formatValid,
    mode,
    availabilityQuery.isFetching,
    usernameTaken,
    usernameAvailable,
  ]);

  const busy = isRegistering || isLoggingIn;

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

  return (
    <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Sign in to view projects
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Each username is unique. Create an account or sign in with an existing one.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            mode === "signin"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            mode === "register"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
          }`}
        >
          Create account
        </button>
      </div>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed || !formatValid) return;
          if (mode === "register") {
            if (!canRegister) return;
            void register(trimmed).catch(() => undefined);
          } else {
            void login(trimmed).catch(() => undefined);
          }
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
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-zinc-950 ${
              usernameTaken
                ? "border-red-400 dark:border-red-700"
                : usernameAvailable
                  ? "border-emerald-400 dark:border-emerald-700"
                  : "border-zinc-300 dark:border-zinc-700"
            }`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your-username"
            autoComplete="username"
            disabled={busy}
            aria-invalid={usernameTaken || undefined}
          />
          {usernameHint ? (
            <p
              className={`text-xs ${
                usernameTaken
                  ? "text-red-600"
                  : usernameAvailable
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-500"
              }`}
            >
              {usernameHint}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={
            !trimmed ||
            !formatValid ||
            busy ||
            (mode === "register" && !canRegister)
          }
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {mode === "register"
            ? isRegistering
              ? "Creating…"
              : "Create account"
            : isLoggingIn
              ? "Signing in…"
              : "Sign in"}
        </button>
      </form>
      {mode === "signin" && loginError ? (
        <p className="mt-2 text-xs text-red-600">{loginError}</p>
      ) : null}
      {mode === "register" && registerError ? (
        <p className="mt-2 text-xs text-red-600">{registerError}</p>
      ) : null}
    </div>
  );
}
