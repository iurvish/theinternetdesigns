import { AlertCircle } from "lucide-react";

export function SetupRequired({ detail }: { detail?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
        <AlertCircle className="size-5" />
      </div>
      <h2 className="text-lg font-medium">Setup required</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The database isn&apos;t reachable yet. Fill in <code>DATABASE_URL</code>{" "}
        and the <code>NEXT_PUBLIC_SUPABASE_*</code> variables in{" "}
        <code>.env.local</code>, then run:
      </p>
      <pre className="mt-4 w-full max-w-md overflow-x-auto rounded-lg bg-muted p-3 text-left text-xs">
{`bun run db:migrate
bun run seed:categories`}
      </pre>
      {detail ? (
        <details className="mt-4 max-w-md text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Error detail</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{detail}</pre>
        </details>
      ) : null}
    </div>
  );
}
