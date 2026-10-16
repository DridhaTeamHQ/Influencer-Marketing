import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI (migrate, db pull, studio) uses the session-mode pooler.
    // The app connects at runtime via DATABASE_URL in lib/prisma.ts.
    url: env("DIRECT_URL"),
  },
});
