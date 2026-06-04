import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  isValidUsernameFormat,
  normalizeUsername,
  type AuthUser,
} from "../shared/auth-user";

export const SESSION_COOKIE = "session_user_id";

export function parseUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const username = normalizeUsername(raw);
  return isValidUsernameFormat(username) ? username : null;
}

export async function requireSessionUser(): Promise<AuthUser | Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  return user;
}

export function mapUserForAuth(user: { id: string; author: string }): AuthUser {
  return { id: user.id, username: user.author };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, author: true },
  });

  return user ? mapUserForAuth(user) : null;
}

export async function setSessionUser(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionUser(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
