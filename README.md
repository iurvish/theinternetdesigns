# The Internet Designs

Curated UI & design inspiration from X, Pinterest, and across the web.

**Live site:** [internetdesigns.com](https://internetdesigns.com)

Browse landing pages, interfaces, micro-interactions, product design, typography, 3D, brand work, logos, and illustration — all collected in one gallery.

## Features

- **Explore feed** — masonry grid of curated design posts with infinite scroll
- **Categories** — Interfaces, Landing pages, Mobile apps, Dashboards, Interactions, Product, Typography, 3D, Brand, Logo, Illustration
- **Creators** — browse work by designer / account
- **Search** — find posts by keyword or color palette
- **Admin studio** — import from X or Pinterest, tag with AI, manage categories & creators
- **Media pipeline** — images/videos stored on Cloudflare R2 with color extraction

## Stack

| Layer | Tech |
| --- | --- |
| Framework | [Next.js](https://nextjs.org) (App Router) |
| UI | React 19, Tailwind CSS, Base UI / shadcn |
| Database | Postgres via [Drizzle ORM](https://orm.drizzle.team) + Supabase |
| Auth | Supabase Auth (admin) |
| Storage | Cloudflare R2 |
| AI | Google Gemini (optional tag suggestions) |
| Motion | Motion |

## Getting started

### Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh))
- A Supabase project (Postgres + Auth)
- A Cloudflare R2 bucket (optional for local browse-only)

### Setup

```bash
git clone https://github.com/iurvish/theinternetdesigns.git
cd theinternetdesigns
npm install
cp .env.example .env.local
```

Fill in `.env.local` with your credentials (see Environment below), then:

```bash
npm run db:migrate
npm run seed:categories
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Admin lives at `/admin` after you create a Supabase user and sign in.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production server |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run seed:categories` | Seed public categories |
| `npm run backfill:colors` | Backfill extracted color palettes |

## Environment

Copy `.env.example` → `.env.local` and set:

```bash
# Supabase Postgres
DATABASE_URL=           # pooled connection URI
DIRECT_URL=             # unpooled URI (migrations)

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=          # public CDN base, no trailing slash

# Site
NEXT_PUBLIC_SITE_URL=https://internetdesigns.com

# Optional
# GEMINI_API_KEY=       # AI tag suggestions in admin
# TWEET_PROVIDER=syndication
# PINTEREST_COOKIE=
```

## Project structure

```
app/
  (public)/          # Explore, categories, creators, post pages
  admin/             # Auth-gated admin (posts, creators, categories)
  api/               # Preview & media helpers
components/          # Shared UI & layout
features/posts/      # Feed, masonry, palettes, queries
lib/                 # DB, R2, auth, providers (X / Pinterest)
drizzle/             # SQL migrations
scripts/             # Seed & backfill utilities
```

## License

Private — all rights reserved.
