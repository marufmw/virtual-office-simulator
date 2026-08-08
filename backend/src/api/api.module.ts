import { Module } from "@nestjs/common";

import { OfficesModule } from "../offices/offices.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { HealthController } from "./health.controller";
import { LayoutController } from "./layout.controller";
import { OfficesController, SessionController } from "./offices.controller";

/** The HTTP side: offices, their member lists, their floor plans. */
@Module({
  imports: [OfficesModule, RealtimeModule],
  controllers: [OfficesController, SessionController, LayoutController, HealthController],
})
export class ApiModule {}
