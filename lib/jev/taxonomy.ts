/** Public browse categories Jev may route a search to. */
export const SEARCH_CATEGORIES = {
  interfaces: "Product UI, app screens, and interface compositions",
  "landing-page": "Marketing landing pages, heroes, and campaign sites",
  "mobile-apps": "Mobile app screens, iOS/Android UI, and phone-sized layouts",
  dashboards: "Dashboards, admin panels, analytics, and data-dense app homes",
  interactions: "Micro-interactions, motion, hover, and animated UI details",
  product: "Shipped product shots and full product UI, not a single component",
  typography: "Type-led work, lettering, and type specimens",
  "3d": "3D renders, scenes, and dimensional illustration",
  "brand-design": "Brand systems, visual identity, and art direction",
  "logo-design": "Logos, wordmarks, and marks",
  illustration: "Illustration, characters, and pictorial work not primarily UI",
  none: "The query is not asking for one of these categories",
} as const;

export const SEARCH_STYLES = {
  light: "Light backgrounds, airy UI, high-key palettes",
  dark: "Dark mode, black or near-black UI, low-key palettes",
  colorful: "Saturated, multi-color, or loud palettes",
  minimal: "Sparse, quiet, lots of whitespace, few ornaments",
  playful: "Bouncy, characterful, toy-like, or whimsical UI",
  gradient: "Prominent gradients as a visual device",
  futuristic: "Sci-fi, chrome, neon, or speculative UI",
  enterprise: "Serious B2B / corporate density and polish",
  isometric: "Isometric 3D or faux-isometric scenes",
  none: "No specific visual style is requested",
} as const;

export const SEARCH_INDUSTRIES = {
  saas: "SaaS and software products",
  consumer: "Consumer apps and everyday products",
  enterprise: "Enterprise / B2B tools",
  b2b: "Business-to-business products",
  ai: "AI products, copilots, and model-adjacent tools",
  "design-tools": "Design, creative, or prototyping tools",
  "developer-tools": "Developer tools, IDEs, infra, and docs for engineers",
  fintech: "Banking, payments, investing, and money products",
  ecommerce: "Stores, merchandising, and checkout",
  entertainment: "Media, streaming, and entertainment",
  agency: "Agency and studio marketing sites",
  media: "Editorial, news, and publishing",
  crypto: "Crypto, web3, and onchain products",
  startup: "Early-stage startup marketing",
  portfolio: "Personal / portfolio sites",
  healthcare: "Health, wellness, and clinical products",
  education: "Education and learning products",
  productivity: "Productivity, notes, and workplace tools",
  marketing: "Marketing platforms and campaign tools",
  other: "An industry that is named but not in this list",
  none: "No specific industry is requested",
} as const;

/** Screen / component patterns used for search + tagging. Keys must exist in `elements`. */
export const SEARCH_ELEMENTS = {
  pricing: "Pricing tables, plans, and billing comparison",
  onboarding: "Onboarding, empty first-run, or welcome flows",
  hero: "Landing-page hero sections",
  sidebar: "App sidebars and secondary navigation",
  navbar: "Top navigation bars",
  "command-palette": "Command palettes and cmdk-style search",
  "empty-state": "Empty states",
  checkout: "Checkout and payment flows",
  chart: "Charts, graphs, and analytics viz",
  form: "Forms and multi-field input",
  "chat-input": "Chat composers and AI prompt inputs",
  "kanban-board": "Kanban / board layouts",
  "search-bar": "Search fields and filter-led search UI",
  table: "Data tables",
  tabs: "Tab bars and segmented controls",
  popup: "Modals, dialogs, and popovers",
  card: "Card grids and card-centric layouts",
  auth: "Sign-in, sign-up, and auth screens",
  features: "Feature grids on marketing pages",
  testimonials: "Social proof and testimonial sections",
  footer: "Site footers",
  "product-detail": "Product / item detail pages",
  calendar: "Calendars and scheduling",
  "filter-panel": "Filters, facets, and refinement panels",
  "file-upload": "Upload dropzones and file pickers",
  none: "No specific component or screen type is requested",
} as const;

export const PUBLIC_CATEGORY_SLUGS = [
  "interfaces",
  "landing-page",
  "mobile-apps",
  "dashboards",
  "interactions",
  "product",
  "typography",
  "3d",
  "brand-design",
  "logo-design",
  "illustration",
] as const;

const CATEGORY_ALIASES: Record<string, keyof typeof SEARCH_CATEGORIES> = {
  dashboard: "dashboards",
  dashboards: "dashboards",
  admin: "dashboards",
  analytics: "dashboards",
  landing: "landing-page",
  "landing page": "landing-page",
  "landing pages": "landing-page",
  "landing-page": "landing-page",
  "landing-pages": "landing-page",
  mobile: "mobile-apps",
  "mobile app": "mobile-apps",
  "mobile apps": "mobile-apps",
  "mobile-apps": "mobile-apps",
  ios: "mobile-apps",
  android: "mobile-apps",
  interface: "interfaces",
  interfaces: "interfaces",
  ui: "interfaces",
  interaction: "interactions",
  interactions: "interactions",
  motion: "interactions",
  animation: "interactions",
  microinteraction: "interactions",
  "micro-interaction": "interactions",
  product: "product",
  type: "typography",
  typography: "typography",
  typeface: "typography",
  "3d": "3d",
  brand: "brand-design",
  branding: "brand-design",
  "brand design": "brand-design",
  "brand-design": "brand-design",
  logo: "logo-design",
  logos: "logo-design",
  "logo design": "logo-design",
  "logo-design": "logo-design",
  illustration: "illustration",
  illustrations: "illustration",
};

const STYLE_ALIASES: Record<string, keyof typeof SEARCH_STYLES> = {
  dark: "dark",
  "dark mode": "dark",
  "dark ui": "dark",
  "dark-ui": "dark",
  light: "light",
  "light mode": "light",
  "light ui": "light",
  "light-ui": "light",
  minimal: "minimal",
  minimalism: "minimal",
  playful: "playful",
  colorful: "colorful",
  colour: "colorful",
  color: "colorful",
  gradient: "gradient",
  gradients: "gradient",
  futuristic: "futuristic",
  enterprise: "enterprise",
  isometric: "isometric",
};

const INDUSTRY_ALIASES: Record<string, keyof typeof SEARCH_INDUSTRIES> = {
  saas: "saas",
  fintech: "fintech",
  finance: "fintech",
  banking: "fintech",
  ai: "ai",
  ecommerce: "ecommerce",
  "e-commerce": "ecommerce",
  shop: "ecommerce",
  crypto: "crypto",
  web3: "crypto",
  b2b: "b2b",
  enterprise: "enterprise",
  consumer: "consumer",
  healthcare: "healthcare",
  education: "education",
  productivity: "productivity",
  marketing: "marketing",
  agency: "agency",
};

const ELEMENT_ALIASES: Record<string, keyof typeof SEARCH_ELEMENTS> = {
  pricing: "pricing",
  "pricing page": "pricing",
  "pricing table": "pricing",
  onboarding: "onboarding",
  hero: "hero",
  sidebar: "sidebar",
  navbar: "navbar",
  nav: "navbar",
  "command palette": "command-palette",
  cmdk: "command-palette",
  "empty state": "empty-state",
  "empty-state": "empty-state",
  checkout: "checkout",
  chart: "chart",
  charts: "chart",
  form: "form",
  forms: "form",
  chat: "chat-input",
  composer: "chat-input",
  kanban: "kanban-board",
  board: "kanban-board",
  table: "table",
  tabs: "tabs",
  modal: "popup",
  popup: "popup",
  dialog: "popup",
  card: "card",
  cards: "card",
  login: "auth",
  signup: "auth",
  auth: "auth",
  footer: "footer",
  calendar: "calendar",
  upload: "file-upload",
};

export type TaxonomyHit = {
  category?: keyof typeof SEARCH_CATEGORIES;
  style?: keyof typeof SEARCH_STYLES;
  industry?: keyof typeof SEARCH_INDUSTRIES;
  element?: keyof typeof SEARCH_ELEMENTS;
};

function cleanQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[#@]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookup<T extends string>(
  table: Record<string, T>,
  phrase: string,
): T | undefined {
  return table[phrase];
}

/**
 * Cheap, offline parse for obvious one-word (or short) taxonomy queries.
 * Leaves compound / fuzzy phrasing to Jev.
 */
export function matchTaxonomyAliases(query: string): TaxonomyHit {
  const q = cleanQuery(query);
  if (!q) return {};

  const hit: TaxonomyHit = {};
  const category = lookup(CATEGORY_ALIASES, q);
  const style = lookup(STYLE_ALIASES, q);
  const industry = lookup(INDUSTRY_ALIASES, q);
  const element = lookup(ELEMENT_ALIASES, q);
  if (category && category !== "none") hit.category = category;
  if (style && style !== "none") hit.style = style;
  if (industry && industry !== "none") hit.industry = industry;
  if (element && element !== "none") hit.element = element;
  if (Object.keys(hit).length > 0) return hit;

  const tokens = q.split(" ");
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      if (!hit.category) {
        const c = lookup(CATEGORY_ALIASES, phrase);
        if (c && c !== "none") hit.category = c;
      }
      if (!hit.style) {
        const s = lookup(STYLE_ALIASES, phrase);
        if (s && s !== "none") hit.style = s;
      }
      if (!hit.industry) {
        const ind = lookup(INDUSTRY_ALIASES, phrase);
        if (ind && ind !== "none") hit.industry = ind;
      }
      if (!hit.element) {
        const e = lookup(ELEMENT_ALIASES, phrase);
        if (e && e !== "none") hit.element = e;
      }
    }
  }
  return hit;
}

export function isPublicCategorySlug(
  slug: string,
): slug is (typeof PUBLIC_CATEGORY_SLUGS)[number] {
  return (PUBLIC_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export const CATEGORY_LABELS: Record<string, string> = {
  interfaces: "Interfaces",
  "landing-page": "Landing page",
  "mobile-apps": "Mobile apps",
  dashboards: "Dashboards",
  interactions: "Interactions",
  product: "Product",
  typography: "Typography",
  "3d": "3D",
  "brand-design": "Brand design",
  "logo-design": "Logo design",
  illustration: "Illustration",
};

export const STYLE_LABELS: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  colorful: "Colorful",
  minimal: "Minimal",
  playful: "Playful",
  gradient: "Gradient",
  futuristic: "Futuristic",
  enterprise: "Enterprise",
  isometric: "Isometric",
};

export const INDUSTRY_LABELS: Record<string, string> = {
  saas: "SaaS",
  consumer: "Consumer",
  enterprise: "Enterprise",
  b2b: "B2B",
  ai: "AI",
  "design-tools": "Design tools",
  "developer-tools": "Developer tools",
  fintech: "Fintech",
  ecommerce: "Ecommerce",
  entertainment: "Entertainment",
  agency: "Agency",
  media: "Media",
  crypto: "Crypto",
  startup: "Startup",
  portfolio: "Portfolio",
  healthcare: "Healthcare",
  education: "Education",
  productivity: "Productivity",
  marketing: "Marketing",
  other: "Other",
};

export const ELEMENT_LABELS: Record<string, string> = {
  pricing: "Pricing",
  onboarding: "Onboarding",
  hero: "Hero",
  sidebar: "Sidebar",
  navbar: "Navbar",
  "command-palette": "Command palette",
  "empty-state": "Empty state",
  checkout: "Checkout",
  chart: "Chart",
  form: "Form",
  "chat-input": "Chat input",
  "kanban-board": "Kanban",
  "search-bar": "Search bar",
  table: "Table",
  tabs: "Tabs",
  popup: "Popup",
  card: "Card",
  auth: "Auth",
  features: "Features",
  testimonials: "Testimonials",
  footer: "Footer",
  "product-detail": "Product detail",
  calendar: "Calendar",
  "filter-panel": "Filters",
  "file-upload": "File upload",
};
