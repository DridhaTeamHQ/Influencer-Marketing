import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one client across dev hot reloads, but replace it after `prisma generate`
// (the regenerated PrismaClient is a new class, so the cached instance no longer matches).
const cached = globalForPrisma.prisma;
export const prisma = cached instanceof PrismaClient ? cached : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  if (cached && cached !== prisma) void cached.$disconnect();
  globalForPrisma.prisma = prisma;
}
