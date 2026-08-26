import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsedPublic.success && typeof window === "undefined") {
  console.warn(
    "[env] Missing NEXT_PUBLIC_* env vars.",
    parsedPublic.error.flatten().fieldErrors,
  );
}

export const publicEnv = parsedPublic.success
  ? parsedPublic.data
  : {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    };

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "[env] Invalid server env: " +
        JSON.stringify(parsed.error.flatten().fieldErrors),
    );
  }
  cachedServerEnv = parsed.data;
  return parsed.data;
}
