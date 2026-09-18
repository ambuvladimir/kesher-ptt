import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { config, prisma } from "./config.js";
import { registerRoutes } from "./routes.js";
import { attachSockets } from "./socket.js";
import { seedIfEmpty } from "./seed.js";

async function main(): Promise<void> {
  await prisma.$connect();
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
  await seedIfEmpty();

  const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const text = typeof body === "string" ? body : "";
    if (!text.trim()) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "נתונים לא תקינים", details: err.flatten() });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    const message = status >= 500 ? "שגיאת שרת" : e.message ?? "שגיאה";
    reply.code(status).send({ error: message });
  });

  await registerRoutes(app);
  await app.ready();

  const io = new Server(app.server, {
    cors: { origin: true },
    maxHttpBufferSize: 2 * 1024 * 1024,
    pingTimeout: 25000,
    pingInterval: 20000,
    perMessageDeflate: false,
    httpCompression: false,
  });
  attachSockets(io);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
