import { join } from "node:path";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ApiModule } from "./api/api.module";
import { buildDataSourceOptions } from "./database/data-source";
import { OfficeModule } from "./office/office.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    // The repository root's .env is the one the whole project shares
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")],
    }),
    // Read lazily: the config module has to have loaded .env by the time
    // the connection string is looked up
    TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions }),
    OfficeModule,
    RealtimeModule,
    ApiModule,
  ],
})
export class AppModule {}
