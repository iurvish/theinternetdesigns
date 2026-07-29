-- Full-text search: generated tsvector column + GIN index.
-- Covers post title/caption/raw_text.
ALTER TABLE "posts"
  ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(caption, '') || ' ' ||
      coalesce(raw_text, '')
    )
  ) STORED;
--> statement-breakpoint
CREATE INDEX "posts_search_tsv_idx" ON "posts" USING GIN ("search_tsv");
--> statement-breakpoint
-- Trigram search on creator username/display name (fast ILIKE).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "creators_username_trgm_idx" ON "creators" USING GIN (username gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "creators_display_name_trgm_idx" ON "creators" USING GIN (display_name gin_trgm_ops);
