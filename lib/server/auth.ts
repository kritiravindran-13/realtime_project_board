import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { AuthUser } from "../shared/auth-user";

export const SESSION_COOKIE = "session_user_id";

const USERNAME_MIN = 2;
const USERNAME_MAX = 32;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function parseUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const username = raw.trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return null;
  if (!USERNAME_PATTERN.test(username)) return null;
  return username;
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
