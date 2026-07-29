import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};

function getClient() {
  if (globalForDb.__pg) return globalForDb.__pg;
  const client = postgres(serverEnv().DATABASE_URL, {
    prepare: false, // Supabase transaction pooler compatibility
    max: 10,
  });
  if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;
  return client;
}

export const db = drizzle(getClient(), { schema });
export { schema };
