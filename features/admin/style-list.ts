/**
 * Admin style tags for posts — visual look/feel, separate from categories
 * and industries. Not shown on the public nav today; stored for filtering
 * and AI tagging.
 *
 * New entries are upserted automatically via `ensureStyles()` on admin load.
 */
export const ADMIN_STYLE_LIST = [
  { slug: "light", name: "Light" },
  { slug: "dark", name: "Dark" },
  { slug: "colorful", name: "Colorful" },
  { slug: "minimal", name: "Minimal" },
  { slug: "playful", name: "Playful" },
  { slug: "gradient", name: "Gradient" },
  { slug: "futuristic", name: "Futuristic" },
  { slug: "enterprise", name: "Enterprise" },
  { slug: "isometric", name: "Isometric" },
] as const;

export type AdminStyleSlug = (typeof ADMIN_STYLE_LIST)[number]["slug"];
