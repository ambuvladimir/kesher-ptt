import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { FastifyRequest } from "fastify";
import { prisma, config } from "./config.js";

export type Role = "admin" | "dispatcher" | "supervisor" | "field";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  callSign: string;
  role: Role;
  unitId: string | null;
};

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "18h" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, config.jwtSecret) as AuthUser;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function checkPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function getBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const q = (req.query as { token?: string }).token;
  return q ?? null;
}

export async function requireUser(req: FastifyRequest): Promise<AuthUser> {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error("נדרשת התחברות"), { statusCode: 401 });
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) {
      throw Object.assign(new Error("משתמש לא פעיל"), { statusCode: 401 });
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      callSign: user.callSign,
      role: user.role as Role,
      unitId: user.unitId,
    };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err;
    throw Object.assign(new Error("טוקן לא תקין"), { statusCode: 401 });
  }
}

export function requireRole(user: AuthUser, roles: Role[]): void {
  if (!roles.includes(user.role)) {
    throw Object.assign(new Error("אין הרשאה לפעולה זו"), { statusCode: 403 });
  }
}

export function canSeeAllLocations(role: Role): boolean {
  return role === "admin" || role === "dispatcher";
}
