import { create } from "zustand";
import type { Role, User } from "./api";

type AuthState = {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  logout: () => void;
  homeFor: (role: Role) => string;
};

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem("kesher_token"),
  user: null,
  setSession: (token, user) => {
    localStorage.setItem("kesher_token", token);
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("kesher_token");
    set({ token: null, user: null });
  },
  homeFor: (role) => {
    if (role === "admin") return "/admin";
    if (role === "dispatcher" || role === "supervisor") return "/dispatch";
    return "/radio";
  },
}));
