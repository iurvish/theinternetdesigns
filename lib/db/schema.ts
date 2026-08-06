import { sql } from "drizzle-orm";
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
} from "drizzle-orm/pg-core";

/**
 * Sources — designed for future providers (threads, instagram, etc).
 * "x" is Twitter/X.
 */
export const sourceEnum = pgEnum("source", [
  "x",
  "threads",
  "instagram",
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
    imageCount: integer("image_count").notNull().default(0),
    published: boolean("published").notNull().default(true),
    /** Generated tsvector for FTS across title + caption + creator refs. */
    searchTokens: text("search_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posts_source_source_id_uniq").on(t.source, t.sourceId),
    index("posts_creator_idx").on(t.creatorId),
    index("posts_published_at_idx").on(t.publishedAt.desc()),
    index("posts_published_idx").on(t.published),
  ],
);

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

/**
 * Global key/value settings, edited from the admin panel. Currently holds the
 * "feed autoplay" flag; kept generic so future toggles reuse the same table.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Setting = typeof settings.$inferSelect;

export type Creator = typeof creators.$inferSelect;
export type NewCreator = typeof creators.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type PostCategory = typeof postCategories.$inferSelect;

/** Ambient SQL fragment for FTS — used when we add a generated column via SQL migration. */
export const postSearchExpression = sql`
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(caption, '') || ' ' || coalesce(raw_text, ''))
`;
