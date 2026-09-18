import { prisma, config } from "./config.js";
import { hashPassword } from "./auth.js";

export async function seedIfEmpty(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) {
    await migrateRoles();
    return;
  }

  const mocad = await prisma.unit.create({
    data: { name: "מוקד", code: "MOCAD", color: "#c81e1e" },
  });
  const drivers = await prisma.unit.create({
    data: { name: "נהגים", code: "DRIVERS", color: "#2563eb" },
  });

  const dispatchCh = await prisma.channel.create({
    data: {
      name: "מוקד ראשי",
      code: "DISP-1",
      kind: "dispatch",
      description: "שיחה קבוצתית — מוקד דיספאצר",
      color: "#c81e1e",
      maxTalkSec: 60,
    },
  });
  const driverCh = await prisma.channel.create({
    data: {
      name: "נהגים",
      code: "TG-DRIVERS",
      kind: "talkgroup",
      description: "שיחה קבוצתית לכל הנהגים",
      color: "#2563eb",
    },
  });
  const emergencyCh = await prisma.channel.create({
    data: {
      name: "חירום",
      code: "EMRG",
      kind: "emergency",
      description: "ערוץ חירום — כולם מאזינים",
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
    displayName: "דיספאצר ראשי",
    callSign: "מוקד-1",
    role: "dispatcher",
    unitId: mocad.id,
    lat: lat + 0.002,
    lng: lng - 0.001,
  });
  const dispatcher2 = await mkUser({
    username: "dispatcher2",
    password: "KesherDisp!23",
    displayName: "דיספאצר משמרת",
    callSign: "מוקד-2",
    role: "dispatcher",
    unitId: mocad.id,
    lat: lat + 0.003,
    lng: lng + 0.001,
  });
  const driver1 = await mkUser({
    username: "driver1",
    password: "KesherField!23",
    displayName: "נהג אמבולנס 12",
    callSign: "12",
    role: "driver",
    unitId: drivers.id,
    lat: lat + 0.01,
    lng: lng + 0.008,
  });
  const driver2 = await mkUser({
    username: "driver2",
    password: "KesherField!23",
    displayName: "נהג אמבולנס 14",
    callSign: "14",
    role: "driver",
    unitId: drivers.id,
    lat: lat - 0.008,
    lng: lng + 0.012,
  });
  const driver3 = await mkUser({
    username: "driver3",
    password: "KesherField!23",
    displayName: "נהג אמבולנס 16",
    callSign: "16",
    role: "driver",
    unitId: drivers.id,
    lat: lat + 0.006,
    lng: lng - 0.01,
  });

  const allUsers = [admin, dispatcher, dispatcher2, driver1, driver2, driver3];
  const memberships: { userId: string; channelId: string; canTalk: boolean; isPrimary: boolean }[] = [];
  const add = (userId: string, channelId: string, canTalk = true, isPrimary = false) => {
    memberships.push({ userId, channelId, canTalk, isPrimary });
  };

  for (const u of allUsers) {
    add(u.id, emergencyCh.id, true, false);
    add(u.id, allCall.id, u.role === "admin" || u.role === "dispatcher", false);
    add(u.id, dispatchCh.id, u.role !== "driver", u.role === "dispatcher");
    add(u.id, driverCh.id, true, u.role === "driver");
  }

  await prisma.channelMember.createMany({ data: memberships });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "seed", detail: "אתחול יוסי אמבולנס: מנהלים, דיספאצרים ונהגים" },
  });
}

async function migrateRoles(): Promise<void> {
  await prisma.user.updateMany({ where: { role: "field" }, data: { role: "driver" } });
}
