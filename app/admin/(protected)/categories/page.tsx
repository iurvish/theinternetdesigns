import { redirect } from "next/navigation";

/** Categories admin UI removed — categories stay in DB for the public nav / future search. */
export default function CategoriesPage() {
  redirect("/admin/posts");
}
