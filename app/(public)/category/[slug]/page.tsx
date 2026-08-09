import { redirect } from "next/navigation";

/** Public category browse UI retired — feed is the only public surface. */
export default function CategoryPage() {
  redirect("/");
}
