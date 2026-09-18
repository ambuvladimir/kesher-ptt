import { create } from "zustand";
import { DEFAULT_BRAND } from "./brand";

export type Branding = {
  name: string;
  product: string;
  logoUrl: string;
  hasCustomLogo: boolean;
};

type BrandingState = Branding & {
  loaded: boolean;
  load: () => Promise<void>;
  apply: (b: Branding) => void;
};

function paint(b: Branding): void {
  document.title = `${b.name} — ${b.product}`;
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.setAttribute("href", b.logoUrl);
}

export const useBranding = create<BrandingState>((set) => ({
  name: DEFAULT_BRAND.name,
  product: DEFAULT_BRAND.product,
  logoUrl: DEFAULT_BRAND.logo,
  hasCustomLogo: false,
  loaded: false,
  apply: (b) => {
    paint(b);
    set({ ...b, loaded: true });
  },
  load: async () => {
    try {
      const res = await fetch("/api/branding");
      const data = (await res.json()) as Branding;
      const next = {
        name: data.name || DEFAULT_BRAND.name,
        product: data.product || DEFAULT_BRAND.product,
        logoUrl: data.logoUrl || DEFAULT_BRAND.logo,
        hasCustomLogo: Boolean(data.hasCustomLogo),
      };
      paint(next);
      set({ ...next, loaded: true });
    } catch {
      paint({ name: DEFAULT_BRAND.name, product: DEFAULT_BRAND.product, logoUrl: DEFAULT_BRAND.logo, hasCustomLogo: false });
      set({ loaded: true });
    }
  },
}));
