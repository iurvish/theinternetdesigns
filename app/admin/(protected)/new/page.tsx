import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New post</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 3</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The upload flow (paste X URL → fetch metadata → download media → optimize → R2 → publish)
          is scaffolded next.
        </CardContent>
      </Card>
    </div>
  );
}

export const metadata = { title: "New post" };
