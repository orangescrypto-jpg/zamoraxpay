-- Performance index for public homepage/blog category reads.
-- Safe to run once on the existing D1 database.
-- The homepage filters published posts by category and orders by publish time.
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_category_published
  ON blog_posts(status, category, published_at DESC);
