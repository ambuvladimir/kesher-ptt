import { prisma } from "./config.js";
import type { AuthUser, Role } from "./auth.js";

export async function audit(userId: string | null, action: string, detail = ""): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, detail } });
}

export function publicUser(user: {
  id: string;
  username: string;
  displayName: string;
  callSign: string;
  role: string;
  unitId: string | null;
  phone: string;
  isActive: boolean;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  locationAt: Date | null;
  status: string;
  lastSeenAt: Date | null;
  unit?: { id: string; name: string; code: string; color: string } | null;
  memberships?: {
    canTalk: boolean;
    canListen: boolean;
    isPrimary: boolean;
    channel: { id: string; name: string; code: string; kind: string; color: string };
  }[];
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    callSign: user.callSign,
    role: user.role as Role,
    unitId: user.unitId,
    phone: user.phone,
    isActive: user.isActive,
    lat: user.lat,
    lng: user.lng,
    accuracy: user.accuracy,
    heading: user.heading,
    speed: user.speed,
    locationAt: user.locationAt,
    status: user.status,
    lastSeenAt: user.lastSeenAt,
    unit: user.unit ?? null,
    memberships: (user.memberships ?? []).map((m) => ({
      channelId: m.channel.id,
      name: m.channel.name,
      code: m.channel.code,
      kind: m.channel.kind,
      color: m.channel.color,
      canTalk: m.canTalk,
      canListen: m.canListen,
      isPrimary: m.isPrimary,
    })),
  };
}

export async function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      unit: true,
      memberships: { include: { channel: true } },
    },
  });
}

export function assertChannelAccess(
  user: AuthUser,
  membership: { canListen: boolean; canTalk: boolean } | undefined,
  needTalk = false,
): void {
  if (user.role === "admin" || user.role === "dispatcher") return;
  if (!membership?.canListen) {
    throw Object.assign(new Error("אין גישה לערוץ"), { statusCode: 403 });
  }
  if (needTalk && !membership.canTalk) {
    throw Object.assign(new Error("אין הרשאת דיבור בערוץ"), { statusCode: 403 });
  }
}
