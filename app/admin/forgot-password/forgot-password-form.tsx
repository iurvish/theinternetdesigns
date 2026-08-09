"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);

        const redirectTo = `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/admin/reset-password`;
        const { error } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(
          email,
          { redirectTo },
        );

        setPending(false);
        if (error) {
          toast.error(error.message);
          return;
        }

        setSent(true);
        toast.success("Check your email for a reset link.");
      }}
    >
      {sent ? (
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>,
          we sent a password reset link. Check your inbox and spam folder.
        </p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}

      <Button type="submit" disabled={pending || sent}>
        {pending ? "Sending…" : sent ? "Email sent" : "Send reset link"}
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/admin/login"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
