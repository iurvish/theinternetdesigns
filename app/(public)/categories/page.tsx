import { redirect } from "next/navigation";

/** Public categories browse UI retired — feed is the only public surface. */
export default function CategoriesPage() {
  redirect("/");
}
