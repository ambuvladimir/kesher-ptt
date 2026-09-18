import { prisma } from "./config.js";

export async function getOrCreateDirect(fromId: string, peerId: string) {
  if (!peerId || peerId === fromId) {
    throw Object.assign(new Error("יש לבחור משתמש אחר"), { statusCode: 400 });
  }
  const [from, peer] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromId } }),
    prisma.user.findUnique({ where: { id: peerId } }),
  ]);
  if (!from || !peer || !peer.isActive) {
    throw Object.assign(new Error("המשתמש לא נמצא"), { statusCode: 404 });
  }

  const [a, b] = [fromId, peerId].sort();
  const code = `DM-${a.slice(0, 10)}-${b.slice(0, 10)}`;
  let channel = await prisma.channel.findUnique({
    where: { code },
    include: {
      members: { include: { user: { select: { id: true, displayName: true, callSign: true, role: true, status: true } } } },
    },
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name: `${from.callSign} ↔ ${peer.callSign}`,
        code,
        kind: "direct",
        description: "שיחה אישית אחד-על-אחד",
        color: "#0ea5e9",
        maxTalkSec: 60,
        members: {
          create: [
            { userId: fromId, canTalk: true, canListen: true },
            { userId: peerId, canTalk: true, canListen: true },
          ],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, callSign: true, role: true, status: true } } } },
      },
    });
  }

  return { channel, from, peer };
}
