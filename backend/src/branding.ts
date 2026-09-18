import { prisma } from "./config.js";

export const DEFAULT_BRAND = {
  name: "יוסי אמבולנס",
  product: "מערכת קשר",
};

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_LOGO_BYTES = 1_500_000;

export type BrandingPublic = {
  name: string;
  product: string;
  logoUrl: string;
  hasCustomLogo: boolean;
  updatedAt: string | null;
};

async function map(): Promise<Record<string, { value: string; updatedAt: Date }>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: r.updatedAt }]));
}

export async function readBranding(): Promise<BrandingPublic> {
  const s = await map();
  const stamp = s.logo?.updatedAt ?? s.orgName?.updatedAt ?? s.orgProduct?.updatedAt ?? null;
  const hasCustomLogo = Boolean(s.logo?.value);
  return {
    name: s.orgName?.value?.trim() || DEFAULT_BRAND.name,
    product: s.orgProduct?.value?.trim() || DEFAULT_BRAND.product,
    logoUrl: hasCustomLogo ? `/api/branding/logo?v=${stamp?.getTime() ?? Date.now()}` : "/logo.png",
    hasCustomLogo,
    updatedAt: stamp ? stamp.toISOString() : null,
  };
}

export async function readLogo(): Promise<{ mime: string; bytes: Buffer } | null> {
  const s = await map();
  if (!s.logo?.value) return null;
  const mime = s.logoMime?.value && ALLOWED_MIME.has(s.logoMime.value) ? s.logoMime.value : "image/png";
  return { mime, bytes: Buffer.from(s.logo.value, "base64") };
}

async function upsert(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function writeBranding(input: {
  name?: string;
  product?: string;
  logoBase64?: string | null;
  logoMime?: string;
  clearLogo?: boolean;
}): Promise<BrandingPublic> {
  if (input.name != null) {
    const name = input.name.trim();
    if (!name) throw Object.assign(new Error("יש להזין שם מערכת"), { statusCode: 400 });
    if (name.length > 80) throw Object.assign(new Error("שם המערכת ארוך מדי"), { statusCode: 400 });
    await upsert("orgName", name);
  }
  if (input.product != null) {
    const product = input.product.trim();
    if (product.length > 80) throw Object.assign(new Error("תיאור המערכת ארוך מדי"), { statusCode: 400 });
    await upsert("orgProduct", product || DEFAULT_BRAND.product);
  }
  if (input.clearLogo) {
    await prisma.setting.deleteMany({ where: { key: { in: ["logo", "logoMime"] } } });
  } else if (input.logoBase64) {
    const mime = input.logoMime ?? "image/png";
    if (!ALLOWED_MIME.has(mime)) {
      throw Object.assign(new Error("סוג קובץ לא נתמך — PNG / JPEG / WEBP"), { statusCode: 400 });
    }
    const bytes = Buffer.from(input.logoBase64, "base64");
    if (!bytes.length) throw Object.assign(new Error("קובץ הלוגו ריק"), { statusCode: 400 });
    if (bytes.length > MAX_LOGO_BYTES) {
      throw Object.assign(new Error("הלוגו גדול מדי (עד 1.5MB)"), { statusCode: 400 });
    }
    await upsert("logo", bytes.toString("base64"));
    await upsert("logoMime", mime);
  }
  return readBranding();
}
