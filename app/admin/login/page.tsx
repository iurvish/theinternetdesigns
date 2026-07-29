import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/admin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Admin sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Only admins created via the Supabase Dashboard can sign in.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}

export const metadata = { title: "Admin sign in" };
