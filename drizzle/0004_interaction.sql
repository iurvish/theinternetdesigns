-- Optional interaction type shown in the post side panel (e.g. MicroInteraction).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS interaction varchar(80);
