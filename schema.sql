-- StudentMarket database schema (SQLite now; standard SQL so it ports to PostgreSQL/MySQL on AWS RDS)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  school        TEXT    NOT NULL,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,              -- bcrypt hash, never the plain password
  email         TEXT    UNIQUE,                -- nullable for now; needed for student verification (Rep-2)
  is_verified   INTEGER NOT NULL DEFAULT 0,    -- 0 = not verified, 1 = verified student
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  category        TEXT    NOT NULL CHECK (category IN ('Textbooks','Furniture','Electronics','School supplies','Clothing')),
  item_condition  TEXT    NOT NULL CHECK (item_condition IN ('New','Like new','Used - good','Used - fair')),
  price           REAL    NOT NULL CHECK (price >= 0),
  school          TEXT    NOT NULL,
  area            TEXT    NOT NULL DEFAULT 'Waterloo',
  pickup_location TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','Sold')),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listing_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  file_path  TEXT    NOT NULL                  -- e.g. /uploads/abc123.jpg
);

CREATE INDEX IF NOT EXISTS idx_listings_seller   ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_school   ON listings(school);
CREATE INDEX IF NOT EXISTS idx_images_listing    ON listing_images(listing_id);
