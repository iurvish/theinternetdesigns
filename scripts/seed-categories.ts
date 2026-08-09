import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { categories } from "../lib/db/schema";

const CATEGORIES: { slug: string; name: string }[] = [
  // Public nav categories
  { slug: "interfaces", name: "Interfaces" },
  { slug: "landing-page", name: "Landing page" },
  { slug: "mobile-apps", name: "Mobile apps" },
  { slug: "dashboards", name: "Dashboards" },
  { slug: "interactions", name: "Interactions" },
  { slug: "product", name: "Product" },
  { slug: "typography", name: "Typography" },
  { slug: "3d", name: "3D" },
  { slug: "brand-design", name: "Brand design" },
  { slug: "logo-design", name: "Logo design" },
  { slug: "illustration", name: "Illustration" },
  // { slug: "landing-pages", name: "Landing Pages" },
  // { slug: "saas", name: "SaaS" },
  // { slug: "ai", name: "AI" },
  { slug: "dashboard", name: "Dashboard" },
  { slug: "mobile-ui", name: "Mobile UI" },
  { slug: "portfolio", name: "Portfolio" },
  { slug: "ecommerce", name: "Ecommerce" },
  { slug: "animation", name: "Animation" },
  { slug: "interaction", name: "Interaction" },
  { slug: "motion-design", name: "Motion Design" },
  { slug: "branding", name: "Branding" },
  { slug: "dark-ui", name: "Dark UI" },
  { slug: "light-ui", name: "Light UI" },
  { slug: "design-systems", name: "Design Systems" },
  { slug: "components", name: "Components" },
  { slug: "onboarding", name: "Onboarding" },
  { slug: "forms", name: "Forms" },
  { slug: "navigation", name: "Navigation" },
  { slug: "pricing", name: "Pricing" },
  { slug: "empty-states", name: "Empty States" },
  { slug: "marketing", name: "Marketing" },
  { slug: "productivity", name: "Productivity" },
  { slug: "developer-tools", name: "Developer Tools" },
  { slug: "startup", name: "Startup" },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL not set");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  console.log(`Seeding ${CATEGORIES.length} categories…`);
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    await db
      .insert(categories)
      .values({
        id: randomUUID(),
        slug: c.slug,
        name: c.name,
        sortOrder: i,
      })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: c.name, sortOrder: sql`excluded.sort_order` },
      });
  }
  console.log("Done.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
