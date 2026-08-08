import { Module } from "@nestjs/common";

import { OfficeModule } from "../office/office.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { HealthController } from "./health.controller";
import { OfficeController } from "./office.controller";

/** The HTTP side: the floor plan, and a health check. */
@Module({
  imports: [OfficeModule, RealtimeModule],
  controllers: [OfficeController, HealthController],
})
export class ApiModule {}
