-- migrations/2026-09-add-blog-authors-comments.sql
-- Blog authors (public profile, no login account needed) + blog comments.
--
-- Apply with:
--   npx wrangler d1 execute <ZAMORAXPAY_DB> --remote --file=migrations/2026-09-add-blog-authors-comments.sql
--
-- Run once. ALTER TABLE ADD COLUMN / CREATE TABLE are not idempotent on
-- purpose (matches the other migrations in this project) — a double
-- apply fails loudly instead of silently doing nothing.

-- 1. Authors -------------------------------------------------------------
-- Admin/moderator-managed. Can represent an external writer (no login,
-- just name/bio/photo) or simply be picked as the byline for any post.
-- Not tied to admin_users — an internal staffer who writes posts still
-- gets an author row so they get a public profile page too.
CREATE TABLE IF NOT EXISTS blog_authors (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  bio               TEXT,
  photo_url         TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blog_authors_slug ON blog_authors(slug);

-- 2. Link posts to an author row ------------------------------------------
-- blog_posts.author_name (free text) is kept as-is for backward
-- compatibility and as a fallback/override label. author_id, when set,
-- points at the structured author with a public profile + photo.
ALTER TABLE blog_posts ADD COLUMN author_id TEXT REFERENCES blog_authors(id);

CREATE INDEX IF NOT EXISTS idx_blog_posts_author_id ON blog_posts(author_id);

-- 3. Comments --------------------------------------------------------------
-- Deliberately simple: just a display name (no account) + the comment
-- body. No author/reviewer link — this is reader feedback, not editorial
-- content. Held for moderation by default so spam doesn't go straight
-- live; admin/moderator can approve/reject from the admin panel.
CREATE TABLE IF NOT EXISTS blog_comments (
  id                TEXT PRIMARY KEY,
  post_id           TEXT NOT NULL REFERENCES blog_posts(id),
  name              TEXT NOT NULL,
  comment           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  ip_address        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id, status, created_at);
