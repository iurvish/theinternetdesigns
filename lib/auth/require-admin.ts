import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Call at the top of any admin Server Component / Server Action.
 * Redirects to /admin/login if there is no active session.
 *
 * Since sign-ups are disabled and admin accounts are created manually
 * from the Supabase Dashboard, any valid session === admin.
 */
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  return user;
}
