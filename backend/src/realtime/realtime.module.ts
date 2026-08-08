import { Module } from "@nestjs/common";

import { OfficeModule } from "../office/office.module";
import { RealtimeGateway } from "./realtime.gateway";

/** The live room: sessions, huddles and the whiteboard, over one WebSocket. */
@Module({
  imports: [OfficeModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
