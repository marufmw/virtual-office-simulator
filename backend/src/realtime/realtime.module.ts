import { Module } from "@nestjs/common";

import { OfficesModule } from "../offices/offices.module";
import { RealtimeGateway } from "./realtime.gateway";

/** The live rooms: sessions, huddles and whiteboards, over one WebSocket. */
@Module({
  imports: [OfficesModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
