import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "./env.js";

let schemaName = "public";

try {
  const parsedUrl = new URL(env.databaseUrl);
  const paramSchema = parsedUrl.searchParams.get("schema");
  if (paramSchema) {
    schemaName = paramSchema;
  }
} catch {
  // Fallback caso a URL seja inválida
}

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const adapter = new PrismaPg(pool, { schema: schemaName });

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});
