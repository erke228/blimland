CREATE TABLE lesson_presentation (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'books',
  cover_key TEXT,
  cover_version INTEGER NOT NULL DEFAULT 0
);
