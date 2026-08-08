import { join } from "node:path";

import { DataSource } from "typeorm";

import { buildDataSourceOptions } from "./data-source";

// Only the TypeORM CLI loads this file — the server builds its connection
// through Nest instead, after ConfigModule has read the same files. Nothing
// here runs at import time inside the app, so a missing DATABASE_URL can't
// take the office down on boot.
for (const file of [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env there; the environment may well supply the variables itself
  }
}

export default new DataSource(buildDataSourceOptions());
