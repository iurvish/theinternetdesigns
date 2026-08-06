"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setFeedAutoplay } from "@/lib/settings";

export async function updateFeedAutoplay(value: boolean) {
  await requireAdmin();
  await setFeedAutoplay(value);
  // The public feed reads this setting server-side, so refresh its cache.
  revalidatePath("/");
  revalidatePath("/admin");
}
