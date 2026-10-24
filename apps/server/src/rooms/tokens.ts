import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateRoomId(): string {
  return randomBytes(9).toString("base64url"); // 12 caratteri
}

export function generateGmToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatchesHash(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
