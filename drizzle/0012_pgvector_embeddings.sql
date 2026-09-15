CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "embedding" vector(2048);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_embedding_hnsw_idx" ON "posts" USING hnsw ((embedding::halfvec(2048)) halfvec_cosine_ops);
