-- Admin-curated feed flags — a post can be both featured and a hidden gem.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden_gem boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS posts_featured_idx ON posts (featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS posts_hidden_gem_idx ON posts (hidden_gem) WHERE hidden_gem = true;
