-- The live site a post is about, for the Websites surface. `source_url` points
-- at the X post / Pinterest pin, which is not the same thing. Nullable: only
-- the admin app writes it, and only for website entries.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "site_url" text;
