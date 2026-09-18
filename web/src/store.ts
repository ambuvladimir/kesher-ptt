import { create } from "zustand";
import type { Role, User } from "./api";

type Theme = "light" | "dark";

type AuthState = {
  token: string | null;
  user: User | null;
  theme: Theme;
  setSession: (token: string, user: User) => void;
  logout: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  homeFor: (_role?: Role) => string;
};

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0f1724" : "#f5f7fb");
}

const savedTheme = (localStorage.getItem("kesher_theme") as Theme | null) ?? "light";
if (typeof document !== "undefined") applyTheme(savedTheme);

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem("kesher_token"),
  user: null,
  theme: savedTheme,
  setSession: (token, user) => {
    localStorage.setItem("kesher_token", token);
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("kesher_token");
    set({ token: null, user: null });
  },
  setTheme: (theme) => {
    localStorage.setItem("kesher_theme", theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  homeFor: () => "/dashboard",
}));
