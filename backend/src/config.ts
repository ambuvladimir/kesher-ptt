import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const schemaDir = path.dirname(fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)));
process.env.DATABASE_URL ??= "file:../data/kesher.db";

function ensureSqliteDir(): void {
  const url = process.env.DATABASE_URL!;
  if (!url.startsWith("file:")) return;
  let fp = url.slice("file:".length);
  if (!path.isAbsolute(fp)) fp = path.resolve(schemaDir, fp);
  mkdirSync(path.dirname(fp), { recursive: true });
}

ensureSqliteDir();

export const prisma = new PrismaClient();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  adminPassword: process.env.ADMIN_PASSWORD ?? "KesherAdmin!23",
  mapCenter: {
    lat: Number(process.env.MAP_CENTER_LAT ?? 32.0853),
    lng: Number(process.env.MAP_CENTER_LNG ?? 34.7818),
  },
};
