import { Controller, Get } from "@nestjs/common";

import { RealtimeGateway } from "../realtime/realtime.gateway";

/** Something for a host's health check to knock on */
@Controller("healthz")
export class HealthController {
  constructor(private readonly realtime: RealtimeGateway) {}

  @Get()
  check() {
    return { ok: true, online: this.realtime.onlineCount };
  }
}
