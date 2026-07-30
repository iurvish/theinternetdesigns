"use client";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AdminSignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut();
        router.push("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
