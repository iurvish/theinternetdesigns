import { redirect } from "next/navigation";

/** Public creators browse UI retired — feed is the only public surface. */
export default function CreatorsPage() {
  redirect("/");
}
