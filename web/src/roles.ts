export type Role = "admin" | "dispatcher" | "supervisor" | "driver" | "field";

export function isAdmin(role?: string): boolean {
  return role === "admin";
}

export function isDispatcher(role?: string): boolean {
  return role === "dispatcher" || role === "supervisor" || role === "admin";
}

export function isDriver(role?: string): boolean {
  return role === "driver" || role === "field";
}

export function roleLabel(role?: string): string {
  if (role === "admin") return "מנהל מערכת";
  if (role === "dispatcher" || role === "supervisor") return "דיספאצר";
  if (role === "driver" || role === "field") return "נהג";
  return role || "";
}

export function kindLabel(kind?: string): string {
  return (
    {
      talkgroup: "קבוצתי",
      dispatch: "מוקד",
      emergency: "חירום",
      broadcast: "שידור כללי",
      direct: "אישי",
    } as Record<string, string>
  )[kind ?? ""] ?? kind ?? "";
}

export function isGroupKind(kind?: string): boolean {
  return kind !== "direct";
}
