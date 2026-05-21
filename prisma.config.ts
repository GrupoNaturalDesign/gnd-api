import { defineConfig } from "prisma/config";
import { getMysqlUrlFromEnv } from "./src/lib/db-config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: getMysqlUrlFromEnv(),
  },
});