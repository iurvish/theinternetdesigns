import { getTableColumns, sql } from "drizzle-orm";
import type { PaletteColor } from "@/lib/media/colors";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

/**
 * Sources — designed for future providers (threads, instagram, etc).
 * "x" is Twitter/X.
 */
export const sourceEnum = pgEnum("source", [
  "x",
  "threads",
  "instagram",
  "pinterest",
  "linkedin",
  "dribbble",
  "behance",
]);

export const mediaKindEnum = pgEnum("media_kind", [
  "image",
  "video",
  "gif",
]);

export const creators = pgTable(
  "creators",
  {
    id: text("id").primaryKey(),
    source: sourceEnum("source").notNull().default("x"),
    /** Provider-native user id (e.g. Twitter numeric id_str). */
    sourceId: text("source_id").notNull(),
    username: varchar("username", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    profileUrl: text("profile_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("creators_source_source_id_uniq").on(t.source, t.sourceId),
    uniqueIndex("creators_source_username_uniq").on(t.source, t.username),
    index("creators_username_idx").on(t.username),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_uniq").on(t.slug)],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    source: sourceEnum("source").notNull().default("x"),
    /** Provider-native post id (e.g. Tweet id_str). */
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }),
    caption: text("caption"),
    /** Full raw text from provider, kept for search. */
    rawText: text("raw_text"),
    /** Original provider payload snapshot for debugging/reprocessing. */
    providerMeta: jsonb("provider_meta"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    hasVideo: boolean("has_video").notNull().default(false),
    /** When true, this post's video autoplays in the feed (else it plays on hover). */
    autoplayInFeed: boolean("autoplay_in_feed").notNull().default(false),
    imageCount: integer("image_count").notNull().default(0),
    published: boolean("published").notNull().default(true),
    /** Curated for the Featured feed filter. */
    featured: boolean("featured").notNull().default(false),
    /** Curated for the Hidden Gems feed filter. */
    hiddenGem: boolean("hidden_gem").notNull().default(false),
    /** Interaction type shown in the post side panel (e.g. MicroInteraction). */
    interaction: varchar("interaction", { length: 80 }),
    /** Generated tsvector for FTS across title + caption + creator refs. */
    searchTokens: text("search_tokens"),
    /** 2048-dim multimodal embedding (admin/OpenRouter). Never select in public lists. */
    embedding: vector("embedding", { dimensions: 2048 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posts_source_source_id_uniq").on(t.source, t.sourceId),
    index("posts_creator_idx").on(t.creatorId),
    index("posts_published_at_idx").on(t.publishedAt.desc()),
    index("posts_published_idx").on(t.published),
    index("posts_featured_idx").on(t.featured),
    index("posts_hidden_gem_idx").on(t.hiddenGem),
    index("posts_embedding_hnsw_idx").using(
      "hnsw",
      sql`("embedding"::halfvec(2048)) halfvec_cosine_ops`,
    ),
  ],
);

const { embedding: _, ...postPublicColumnSet } = getTableColumns(posts);
/** Post columns safe for public selects — omits the 2048-dim embedding. */
export const postPublicColumns = postPublicColumnSet;
export type PostPublic = Omit<typeof posts.$inferSelect, "embedding">;

export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull(),
    position: integer("position").notNull().default(0),
    /** CDN URLs — original and derived variants. */
    originalUrl: text("original_url").notNull(),
    mediumUrl: text("medium_url"),
    thumbnailUrl: text("thumbnail_url"),
    /** For videos: poster/preview. */
    posterUrl: text("poster_url"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    /** Original provider URL (for reference; do not display). */
    sourceMediaUrl: text("source_media_url"),
    /** Dominant-colour palette with usage percentages, extracted at upload. */
    colors: jsonb("colors").$type<PaletteColor[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_post_idx").on(t.postId, t.position)],
);

export const postCategories = pgTable(
  "post_categories",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.categoryId] }),
    index("post_categories_category_idx").on(t.categoryId),
  ],
);

/** Admin-only industry tags (Agency, SaaS, Fintech, etc.) — not public nav categories. */
export const industries = pgTable(
  "industries",
  {
    id: text("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("industries_slug_uniq").on(t.slug)],
);

export const postIndustries = pgTable(
  "post_industries",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    industryId: text("industry_id")
      .notNull()
      .references(() => industries.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.industryId] }),
    index("post_industries_industry_idx").on(t.industryId),
  ],
);

/** Admin visual style tags (Minimal, Dark, Playful, etc.) — not public nav. */
export const styles = pgTable(
  "styles",
  {
    id: text("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("styles_slug_uniq").on(t.slug)],
);

export const postStyles = pgTable(
  "post_styles",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    styleId: text("style_id")
      .notNull()
      .references(() => styles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.styleId] }),
    index("post_styles_style_idx").on(t.styleId),
  ],
);

/**
 * Global key/value settings. Currently holds the "feed autoplay" flag; kept
 * generic so future toggles reuse the same table.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Setting = typeof settings.$inferSelect;

/**
 * Public gallery clipboard copies (image frame / video frame).
 * Written by the public site; read by the separate admin app.
 */
export const mediaCopies = pgTable(
  "media_copies",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_copies_created_idx").on(t.createdAt.desc()),
    index("media_copies_media_idx").on(t.mediaId),
    index("media_copies_post_idx").on(t.postId),
    index("media_copies_creator_idx").on(t.creatorId),
  ],
);

export type MediaCopy = typeof mediaCopies.$inferSelect;
export type NewMediaCopy = typeof mediaCopies.$inferInsert;

export type Creator = typeof creators.$inferSelect;
export type NewCreator = typeof creators.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type PostCategory = typeof postCategories.$inferSelect;
export type Industry = typeof industries.$inferSelect;
export type NewIndustry = typeof industries.$inferInsert;
export type PostIndustry = typeof postIndustries.$inferSelect;
export type Style = typeof styles.$inferSelect;
export type NewStyle = typeof styles.$inferInsert;
export type PostStyle = typeof postStyles.$inferSelect;

/** Ambient SQL fragment for FTS — used when we add a generated column via SQL migration. */
export const postSearchExpression = sql`
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(caption, '') || ' ' || coalesce(raw_text, ''))
`;
