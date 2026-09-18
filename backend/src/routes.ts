import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./config.js";
import {
  checkPassword,
  hashPassword,
  requireRole,
  requireUser,
  signToken,
  type Role,
} from "./auth.js";
import { audit, loadUser, publicUser } from "./util.js";
import { getOrCreateDirect } from "./direct.js";
import { readBranding, readLogo, writeBranding } from "./branding.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const userSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(6).optional().or(z.literal("")),
  displayName: z.string().min(1),
  callSign: z.string().min(1),
  role: z.enum(["admin", "dispatcher", "supervisor", "driver", "field"]),
  unitId: z.string().nullable().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  channelIds: z
    .array(
      z.object({
        channelId: z.string(),
        canTalk: z.boolean().optional(),
        canListen: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
});

const unitSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  color: z.string().optional(),
});

const channelSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  kind: z.enum(["talkgroup", "dispatch", "emergency", "broadcast", "direct"]),
  description: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  maxTalkSec: z.number().int().min(5).max(180).optional(),
  members: z
    .array(
      z.object({
        userId: z.string(),
        canTalk: z.boolean().optional(),
        canListen: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
});

async function setMemberships(
  userId: string,
  channelIds: {
    channelId: string;
    canTalk?: boolean;
    canListen?: boolean;
    isPrimary?: boolean;
  }[],
) {
  await prisma.channelMember.deleteMany({ where: { userId } });
  if (!channelIds.length) return;
  await prisma.channelMember.createMany({
    data: channelIds.map((c) => ({
      userId,
      channelId: c.channelId,
      canTalk: c.canTalk ?? true,
      canListen: c.canListen ?? true,
      isPrimary: c.isPrimary ?? false,
    })),
  });
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true, service: "kesher" }));

  app.get("/api/branding", async () => readBranding());

  app.get("/api/branding/logo", async (_req, reply) => {
    const logo = await readLogo();
    if (!logo) return reply.redirect("/logo.png");
    reply.header("Cache-Control", "no-cache");
    return reply.type(logo.mime).send(logo.bytes);
  });

  app.put("/api/branding", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        product: z.string().max(80).optional(),
        logoBase64: z.string().min(1).nullable().optional(),
        logoMime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]).optional(),
        clearLogo: z.boolean().optional(),
      })
      .parse(req.body);
    const branding = await writeBranding(body);
    await audit(auth.id, "branding.update", branding.name);
    return branding;
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { username: body.username.toLowerCase() },
      include: { unit: true, memberships: { include: { channel: true } } },
    });
    if (!user || !user.isActive || !(await checkPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "שם משתמש או סיסמה שגויים" });
    }
    const auth = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      callSign: user.callSign,
      role: user.role as Role,
      unitId: user.unitId,
    };
    await audit(user.id, "login", "התחברות למערכת");
    return { token: signToken(auth), user: publicUser(user) };
  });

  app.get("/api/me", async (req) => {
    const auth = await requireUser(req);
    const user = await loadUser(auth.id);
    if (!user) throw Object.assign(new Error("לא נמצא"), { statusCode: 404 });
    return publicUser(user);
  });

  app.get("/api/meta", async (req) => {
    const auth = await requireUser(req);
    const [units, channels] = await Promise.all([
      prisma.unit.findMany({ orderBy: { name: "asc" } }),
      prisma.channel.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return { role: auth.role, units, channels };
  });

  app.get("/api/users", async (req) => {
    const auth = await requireUser(req);
    const users = await prisma.user.findMany({
      include: { unit: true, memberships: { include: { channel: true } } },
      orderBy: { callSign: "asc" },
    });
    if (auth.role === "admin") return users.map(publicUser);
    return users.filter((u) => u.isActive).map(publicUser);
  });

  app.post("/api/users", async (req, reply) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const body = userSchema.parse(req.body);
    if (!body.password) return reply.code(400).send({ error: "נדרשת סיסמה" });
    const created = await prisma.user.create({
      data: {
        username: body.username.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName,
        callSign: body.callSign,
        role: body.role,
        unitId: body.unitId ?? null,
        phone: body.phone ?? "",
        isActive: body.isActive ?? true,
      },
    });
    if (body.channelIds) await setMemberships(created.id, body.channelIds);
    await audit(auth.id, "user.create", created.username);
    const user = await loadUser(created.id);
    return publicUser(user!);
  });

  app.patch("/api/users/:id", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const { id } = req.params as { id: string };
    const body = userSchema.partial().parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.username) data.username = body.username.toLowerCase();
    if (body.displayName) data.displayName = body.displayName;
    if (body.callSign) data.callSign = body.callSign;
    if (body.role) data.role = body.role;
    if (body.unitId !== undefined) data.unitId = body.unitId;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) data.passwordHash = await hashPassword(body.password);
    await prisma.user.update({ where: { id }, data });
    if (body.channelIds) await setMemberships(id, body.channelIds);
    await audit(auth.id, "user.update", id);
    const user = await loadUser(id);
    return publicUser(user!);
  });

  app.delete("/api/users/:id", async (req, reply) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const { id } = req.params as { id: string };
    if (id === auth.id) return reply.code(400).send({ error: "לא ניתן למחוק את עצמך" });
    await prisma.user.delete({ where: { id } });
    await audit(auth.id, "user.delete", id);
    return { ok: true };
  });

  app.get("/api/units", async (req) => {
    await requireUser(req);
    return prisma.unit.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });
  });

  app.post("/api/units", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const body = unitSchema.parse(req.body);
    const unit = await prisma.unit.create({ data: { ...body, color: body.color ?? "#3b82f6" } });
    await audit(auth.id, "unit.create", unit.code);
    return unit;
  });

  app.patch("/api/units/:id", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const { id } = req.params as { id: string };
    const body = unitSchema.partial().parse(req.body);
    const unit = await prisma.unit.update({ where: { id }, data: body });
    await audit(auth.id, "unit.update", id);
    return unit;
  });

  app.delete("/api/units/:id", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const { id } = req.params as { id: string };
    await prisma.unit.delete({ where: { id } });
    await audit(auth.id, "unit.delete", id);
    return { ok: true };
  });

  app.get("/api/channels", async (req) => {
    const auth = await requireUser(req);
    const channels = await prisma.channel.findMany({
      include: {
        members: { include: { user: { select: { id: true, displayName: true, callSign: true, role: true } } } },
      },
      orderBy: { name: "asc" },
    });
    if (auth.role === "admin" || auth.role === "dispatcher" || auth.role === "supervisor") return channels;
    const mine = new Set(
      (
        await prisma.channelMember.findMany({
          where: { userId: auth.id, canListen: true },
          select: { channelId: true },
        })
      ).map((m) => m.channelId),
    );
    return channels.filter((c) => mine.has(c.id) || c.kind === "emergency" || c.kind === "broadcast");
  });

  app.post("/api/channels", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin", "dispatcher"]);
    const body = channelSchema.parse(req.body);
    const { members, ...rest } = body;
    const channel = await prisma.channel.create({ data: rest });
    if (members?.length) {
      await prisma.channelMember.createMany({
        data: members.map((m) => ({
          channelId: channel.id,
          userId: m.userId,
          canTalk: m.canTalk ?? true,
          canListen: m.canListen ?? true,
          isPrimary: m.isPrimary ?? false,
        })),
      });
    }
    await audit(auth.id, "channel.create", channel.code);
    return prisma.channel.findUnique({
      where: { id: channel.id },
      include: { members: { include: { user: true } } },
    });
  });

  app.patch("/api/channels/:id", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin", "dispatcher"]);
    const { id } = req.params as { id: string };
    const body = channelSchema.partial().parse(req.body);
    const { members, ...rest } = body;
    await prisma.channel.update({ where: { id }, data: rest });
    if (members) {
      await prisma.channelMember.deleteMany({ where: { channelId: id } });
      if (members.length) {
        await prisma.channelMember.createMany({
          data: members.map((m) => ({
            channelId: id,
            userId: m.userId,
            canTalk: m.canTalk ?? true,
            canListen: m.canListen ?? true,
            isPrimary: m.isPrimary ?? false,
          })),
        });
      }
    }
    await audit(auth.id, "channel.update", id);
    return prisma.channel.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
  });

  app.delete("/api/channels/:id", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    const { id } = req.params as { id: string };
    await prisma.channel.delete({ where: { id } });
    await audit(auth.id, "channel.delete", id);
    return { ok: true };
  });

  app.post("/api/direct", async (req, reply) => {
    const auth = await requireUser(req);
    const body = z.object({ peerId: z.string().min(1) }).parse(req.body);
    const { channel, peer } = await getOrCreateDirect(auth.id, body.peerId);
    await audit(auth.id, "direct.open", peer.callSign);
    return channel;
  });

  app.get("/api/locations", async (req) => {
    const auth = await requireUser(req);
    const users = await prisma.user.findMany({
      where: { isActive: true, lat: { not: null } },
      include: { unit: true },
    });
    if (auth.role === "admin" || auth.role === "dispatcher") {
      return users.map(publicUser);
    }
    if (auth.role === "supervisor") {
      return users.filter((u) => u.unitId === auth.unitId).map(publicUser);
    }
    return users.filter((u) => u.id === auth.id).map(publicUser);
  });

  app.get("/api/locations/:userId/history", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin", "dispatcher", "supervisor"]);
    const { userId } = req.params as { userId: string };
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    return prisma.locationPing.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  });

  app.get("/api/messages", async (req) => {
    const auth = await requireUser(req);
    const q = req.query as { channelId?: string };
    if (!q.channelId) return [];
    if (auth.role !== "admin" && auth.role !== "dispatcher") {
      const m = await prisma.channelMember.findUnique({
        where: { userId_channelId: { userId: auth.id, channelId: q.channelId } },
      });
      if (!m?.canListen) return [];
    }
    const rows = await prisma.message.findMany({
      where: { channelId: q.channelId },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { user: { select: { displayName: true, callSign: true } } },
    });
    return rows.reverse();
  });

  app.get("/api/audit", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin"]);
    return prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { displayName: true, callSign: true, username: true } } },
    });
  });

  app.get("/api/ptt-log", async (req) => {
    const auth = await requireUser(req);
    requireRole(auth, ["admin", "dispatcher"]);
    return prisma.pttLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 150,
      include: {
        user: { select: { displayName: true, callSign: true } },
        channel: { select: { name: true, code: true } },
      },
    });
  });
}
