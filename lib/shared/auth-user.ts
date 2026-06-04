export type AuthUser = {
  id: string;
  username: string;
};

export type AuthBody = {
  username?: unknown;
};

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 32;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

export function isValidUsernameFormat(raw: string): boolean {
  const username = normalizeUsername(raw);
  return (
    username.length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(username)
  );
}
