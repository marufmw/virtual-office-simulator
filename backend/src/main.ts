import "reflect-metadata";

import type { Server } from "node:http";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { RealtimeGateway } from "./realtime/realtime.gateway";
import { staticFallback } from "./static.middleware";

const PORT = Number(process.env.PORT) || 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });
  app.enableShutdownHooks();

  // The tables have to exist and the office has to be seeded before the
  // first person knocks, so nothing is served until init has finished
  await app.init();

  // Mounted after the router, so the built frontend only answers what no
  // controller did — a deep link lands on index.html rather than a 404
  app.use(staticFallback);

  // The room shares the HTTP server: page, API and WebSocket, one port
  await app.get(RealtimeGateway).attach(app.getHttpServer() as Server);

  await app.listen(PORT);
  new Logger("Bootstrap").log(
    `Server running on http://localhost:${PORT} (WebSocket on the same port)`
  );
}

bootstrap().catch((error) => {
  new Logger("Bootstrap").error("The office could not start", error as Error);
  process.exit(1);
});
