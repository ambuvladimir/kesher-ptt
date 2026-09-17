import { prisma, config } from "./config.js";
import { hashPassword } from "./auth.js";

export async function seedIfEmpty(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  const mocad = await prisma.unit.create({
    data: { name: "מוקד", code: "MOCAD", color: "#ef4444" },
  });
  const siur = await prisma.unit.create({
    data: { name: "סיור", code: "SIUR", color: "#3b82f6" },
  });
  const avtacha = await prisma.unit.create({
    data: { name: "אבטחה", code: "AVTACHA", color: "#22c55e" },
  });
  const maintenance = await prisma.unit.create({
    data: { name: "תחזוקה", code: "TECH", color: "#f59e0b" },
  });

  const dispatchCh = await prisma.channel.create({
    data: {
      name: "מוקד ראשי",
      code: "DISP-1",
      kind: "dispatch",
      description: "ערוץ דיספאצר ראשי",
      color: "#ef4444",
      maxTalkSec: 60,
    },
  });
  const patrolCh = await prisma.channel.create({
    data: {
      name: "סיור 1",
      code: "TG-SIUR-1",
      kind: "talkgroup",
      description: "קבוצת דיבור לסיור",
      color: "#3b82f6",
    },
  });
  const guardCh = await prisma.channel.create({
    data: {
      name: "אבטחה",
      code: "TG-SEC",
      kind: "talkgroup",
      description: "אבטחה היקפית",
      color: "#22c55e",
    },
  });
  const techCh = await prisma.channel.create({
    data: {
      name: "תחזוקה",
      code: "TG-TECH",
      kind: "talkgroup",
      description: "צוות טכני",
      color: "#f59e0b",
    },
  });
  const emergencyCh = await prisma.channel.create({
    data: {
      name: "חירום",
      code: "EMRG",
      kind: "emergency",
      description: "ערוץ חירום ארגוני — כולם מאזינים",
      color: "#fb7185",
      maxTalkSec: 90,
    },
  });
  const allCall = await prisma.channel.create({
    data: {
      name: "שידור כללי",
      code: "ALLCALL",
      kind: "broadcast",
      description: "שידור לכל הניידות",
      color: "#a78bfa",
      maxTalkSec: 30,
    },
  });

  const mkUser = async (input: {
    username: string;
    password: string;
    displayName: string;
    callSign: string;
    role: string;
    unitId: string | null;
    lat?: number;
    lng?: number;
  }) =>
    prisma.user.create({
      data: {
        username: input.username,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        callSign: input.callSign,
        role: input.role,
        unitId: input.unitId,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        locationAt: input.lat != null ? new Date() : null,
        status: "offline",
      },
    });

  const { lat, lng } = config.mapCenter;
  const admin = await mkUser({
    username: "admin",
    password: config.adminPassword,
    displayName: "מנהל מערכת",
    callSign: "HQ-1",
    role: "admin",
    unitId: mocad.id,
    lat,
    lng,
  });
  const dispatcher = await mkUser({
    username: "dispatcher",
    password: "KesherDisp!23",
    displayName: "מוקדן ראשי",
    callSign: "מוקד-1",
    role: "dispatcher",
    unitId: mocad.id,
    lat: lat + 0.002,
    lng: lng - 0.001,
  });
  const supervisor = await mkUser({
    username: "supervisor",
    password: "KesherSup!23",
    displayName: "אחמ״ש סיור",
    callSign: "סיור-פיקוד",
    role: "supervisor",
    unitId: siur.id,
    lat: lat - 0.004,
    lng: lng + 0.003,
  });
  const field1 = await mkUser({
    username: "siur1",
    password: "KesherField!23",
    displayName: "ניידת 12",
    callSign: "12",
    role: "field",
    unitId: siur.id,
    lat: lat + 0.01,
    lng: lng + 0.008,
  });
  const field2 = await mkUser({
    username: "siur2",
    password: "KesherField!23",
    displayName: "ניידת 14",
    callSign: "14",
    role: "field",
    unitId: siur.id,
    lat: lat - 0.008,
    lng: lng + 0.012,
  });
  const guard1 = await mkUser({
    username: "sec1",
    password: "KesherField!23",
    displayName: "מאבטח שער",
    callSign: "שער-1",
    role: "field",
    unitId: avtacha.id,
    lat: lat + 0.003,
    lng: lng - 0.01,
  });
  const tech1 = await mkUser({
    username: "tech1",
    password: "KesherField!23",
    displayName: "טכנאי תורן",
    callSign: "טכני-1",
    role: "field",
    unitId: maintenance.id,
    lat: lat - 0.012,
    lng: lng - 0.006,
  });

  const allUsers = [admin, dispatcher, supervisor, field1, field2, guard1, tech1];
  const memberships: { userId: string; channelId: string; canTalk: boolean; isPrimary: boolean }[] = [];

  const add = (userId: string, channelId: string, canTalk = true, isPrimary = false) => {
    memberships.push({ userId, channelId, canTalk, isPrimary });
  };

  for (const u of allUsers) {
    add(u.id, emergencyCh.id, true, false);
    add(u.id, allCall.id, u.role === "admin" || u.role === "dispatcher", false);
    add(u.id, dispatchCh.id, u.role !== "field", u.role === "dispatcher");
  }
  add(supervisor.id, patrolCh.id, true, true);
  add(field1.id, patrolCh.id, true, true);
  add(field2.id, patrolCh.id, true, true);
  add(guard1.id, guardCh.id, true, true);
  add(tech1.id, techCh.id, true, true);
  add(admin.id, patrolCh.id, true);
  add(admin.id, guardCh.id, true);
  add(admin.id, techCh.id, true);
  add(dispatcher.id, patrolCh.id, true);
  add(dispatcher.id, guardCh.id, true);
  add(dispatcher.id, techCh.id, true);

  await prisma.channelMember.createMany({ data: memberships });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "seed", detail: "אתחול נתוני דמו" },
  });
}
