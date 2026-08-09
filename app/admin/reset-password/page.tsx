import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Reset password</h1>
        {user ? (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Choose a new password for <span className="font-medium text-foreground">{user.email}</span>.
            </p>
            <ResetPasswordForm />
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Open the reset link from your email to set a new password. Links expire after a short time.
            </p>
            <Link
              href="/admin/forgot-password"
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Request a new link
            </Link>
            <p className="mt-4 text-center text-sm">
              <Link
                href="/admin/login"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export const metadata = { title: "Reset password" };
