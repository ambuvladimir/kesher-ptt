import type { Server } from "socket.io";
import { prisma } from "./config.js";
import { verifyToken, type AuthUser } from "./auth.js";
import { audit } from "./util.js";

type Floor = {
  userId: string;
  callSign: string;
  displayName: string;
  socketId: string;
  startedAt: number;
  logId: string;
  timer: NodeJS.Timeout;
};

const floors = new Map<string, Floor>();
const socketsByUser = new Map<string, Set<string>>();

function room(channelId: string): string {
  return `channel:${channelId}`;
}

export function attachSockets(io: Server): void {
  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string }).token;
      if (!token) return next(new Error("no token"));
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("bad token"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user as AuthUser;
    if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set());
    socketsByUser.get(user.id)!.add(socket.id);

    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    if (user.unitId) socket.join(`unit:${user.unitId}`);

    const memberships = await prisma.channelMember.findMany({
      where: { userId: user.id, canListen: true },
      include: { channel: true },
    });
    const extra = await prisma.channel.findMany({
      where: { kind: { in: ["emergency", "broadcast"] }, isActive: true },
    });
    const channels = new Map<string, (typeof extra)[0]>();
    for (const m of memberships) channels.set(m.channel.id, m.channel);
    for (const c of extra) channels.set(c.id, c);
    if (user.role === "admin" || user.role === "dispatcher") {
      const all = await prisma.channel.findMany({ where: { isActive: true } });
      for (const c of all) channels.set(c.id, c);
    }
    for (const id of channels.keys()) socket.join(room(id));

    await prisma.user.update({
      where: { id: user.id },
      data: { status: "available", lastSeenAt: new Date() },
    });
    io.emit("presence:update", { userId: user.id, status: "available", lastSeenAt: new Date() });

    socket.emit("hello", {
      userId: user.id,
      floors: [...floors.entries()].map(([channelId, f]) => ({
        channelId,
        userId: f.userId,
        callSign: f.callSign,
        displayName: f.displayName,
      })),
    });

    socket.on("channel:select", (payload: { channelId?: string }) => {
      socket.data.selectedChannelId = payload?.channelId;
    });

    socket.on("location:update", async (payload: {
      lat?: number;
      lng?: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
    }) => {
      if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number") return;
      const now = new Date();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lat: payload.lat,
          lng: payload.lng,
          accuracy: payload.accuracy ?? null,
          heading: payload.heading ?? null,
          speed: payload.speed ?? null,
          locationAt: now,
          lastSeenAt: now,
        },
      });
      await prisma.locationPing.create({
        data: {
          userId: user.id,
          lat: payload.lat,
          lng: payload.lng,
          accuracy: payload.accuracy ?? null,
          heading: payload.heading ?? null,
          speed: payload.speed ?? null,
        },
      });
      const loc = {
        userId: user.id,
        callSign: user.callSign,
        displayName: user.displayName,
        role: user.role,
        unitId: user.unitId,
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy ?? null,
        heading: payload.heading ?? null,
        speed: payload.speed ?? null,
        locationAt: now,
        status: "available",
      };
      io.to("role:admin").to("role:dispatcher").emit("location:broadcast", loc);
      if (user.unitId) io.to(`unit:${user.unitId}`).emit("location:broadcast", loc);
    });

    socket.on("ptt:request", async (payload: { channelId?: string }) => {
      const channelId = payload?.channelId;
      if (!channelId) return;
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel?.isActive) {
        socket.emit("ptt:denied", { channelId, reason: "ערוץ לא פעיל" });
        return;
      }
      const member = await prisma.channelMember.findUnique({
        where: { userId_channelId: { userId: user.id, channelId } },
      });
      const privileged = user.role === "admin" || user.role === "dispatcher";
      const canTalk =
        privileged ||
        member?.canTalk ||
        channel.kind === "emergency" ||
        channel.kind === "broadcast";
      if (!canTalk) {
        socket.emit("ptt:denied", { channelId, reason: "אין הרשאת דיבור" });
        return;
      }
      const existing = floors.get(channelId);
      if (existing && existing.userId !== user.id) {
        const canPreempt = privileged && existing.userId !== user.id && channel.kind !== "emergency";
        if (!canPreempt) {
          socket.emit("ptt:denied", {
            channelId,
            reason: "הערוץ תפוס",
            holder: existing.callSign,
          });
          return;
        }
        await releaseFloor(io, channelId, "preempt");
      }
      const log = await prisma.pttLog.create({
        data: { channelId, userId: user.id },
      });
      const maxMs = channel.maxTalkSec * 1000;
      const timer = setTimeout(() => {
        void releaseFloor(io, channelId, "timeout");
      }, maxMs);
      floors.set(channelId, {
        userId: user.id,
        callSign: user.callSign,
        displayName: user.displayName,
        socketId: socket.id,
        startedAt: Date.now(),
        logId: log.id,
        timer,
      });
      await prisma.user.update({ where: { id: user.id }, data: { status: "talking" } });
      socket.emit("ptt:granted", { channelId, maxMs });
      io.to(room(channelId)).emit("ptt:start", {
        channelId,
        userId: user.id,
        callSign: user.callSign,
        displayName: user.displayName,
        maxMs,
      });
    });

    socket.on("ptt:audio", (data: unknown, meta?: { channelId?: string }) => {
      const channelId = meta?.channelId ?? socket.data.selectedChannelId;
      if (!channelId) return;
      const floor = floors.get(channelId);
      if (!floor || floor.userId !== user.id) return;
      const buf = toBuffer(data);
      if (!buf) return;
      socket.to(room(channelId)).emit("ptt:audio", buf, {
        channelId,
        userId: user.id,
      });
    });

    socket.on("ptt:release", async (payload: { channelId?: string }) => {
      const channelId = payload?.channelId;
      if (!channelId) return;
      const floor = floors.get(channelId);
      if (!floor || floor.userId !== user.id) return;
      await releaseFloor(io, channelId, "release");
    });

    socket.on("message:send", async (payload: { channelId?: string; body?: string }) => {
      const channelId = payload?.channelId;
      const body = (payload?.body ?? "").trim();
      if (!channelId || !body) return;
      const msg = await prisma.message.create({
        data: { channelId, userId: user.id, body, kind: "text" },
        include: { user: { select: { displayName: true, callSign: true } } },
      });
      io.to(room(channelId)).emit("message:new", msg);
    });

    socket.on("emergency", async (payload: { lat?: number; lng?: number; note?: string }) => {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          status: "emergency",
          lat: payload?.lat ?? undefined,
          lng: payload?.lng ?? undefined,
          locationAt: payload?.lat != null ? new Date() : undefined,
        },
      });
      const emergency = await prisma.channel.findFirst({ where: { kind: "emergency", isActive: true } });
      const alert = {
        userId: user.id,
        callSign: user.callSign,
        displayName: user.displayName,
        unitId: user.unitId,
        lat: payload?.lat ?? null,
        lng: payload?.lng ?? null,
        note: payload?.note ?? "קריאת חירום",
        at: new Date(),
        channelId: emergency?.id ?? null,
      };
      if (emergency) {
        await prisma.message.create({
          data: {
            channelId: emergency.id,
            userId: user.id,
            body: payload?.note || "קריאת חירום",
            kind: "emergency",
          },
        });
      }
      await audit(user.id, "emergency", payload?.note ?? "");
      io.emit("emergency:alert", alert);
    });

    socket.on("status:set", async (payload: { status?: string }) => {
      const status = payload?.status;
      if (!status || !["available", "busy", "offline"].includes(status)) return;
      await prisma.user.update({ where: { id: user.id }, data: { status, lastSeenAt: new Date() } });
      io.emit("presence:update", { userId: user.id, status, lastSeenAt: new Date() });
    });

    socket.on("disconnect", async () => {
      const set = socketsByUser.get(user.id);
      set?.delete(socket.id);
      for (const [channelId, floor] of floors) {
        if (floor.socketId === socket.id) await releaseFloor(io, channelId, "disconnect");
      }
      if (!set || set.size === 0) {
        socketsByUser.delete(user.id);
        await prisma.user.update({
          where: { id: user.id },
          data: { status: "offline", lastSeenAt: new Date() },
        });
        io.emit("presence:update", { userId: user.id, status: "offline", lastSeenAt: new Date() });
      }
    });
  });
}

function toBuffer(data: unknown): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    const arr = (data as { data: number[] }).data;
    if (Array.isArray(arr)) return Buffer.from(arr);
  }
  return null;
}

async function releaseFloor(io: Server, channelId: string, reason: string): Promise<void> {
  const floor = floors.get(channelId);
  if (!floor) return;
  clearTimeout(floor.timer);
  floors.delete(channelId);
  const durationMs = Date.now() - floor.startedAt;
  await prisma.pttLog.update({
    where: { id: floor.logId },
    data: { endedAt: new Date(), durationMs },
  });
  const stillTalking = [...floors.values()].some((f) => f.userId === floor.userId);
  if (!stillTalking) {
    await prisma.user.update({
      where: { id: floor.userId },
      data: { status: "available", lastSeenAt: new Date() },
    });
    io.emit("presence:update", { userId: floor.userId, status: "available", lastSeenAt: new Date() });
  }
  io.to(room(channelId)).emit("ptt:end", { channelId, userId: floor.userId, reason, durationMs });
}
