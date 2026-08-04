-- Dominant-colour palette per media, extracted at upload time.
-- Each element: { hex, r, g, b, percent }. Defaults to an empty array so
-- existing rows are valid; the backfill script populates them.
ALTER TABLE "media"
  ADD COLUMN "colors" jsonb NOT NULL DEFAULT '[]'::jsonb;
