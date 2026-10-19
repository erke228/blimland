CREATE TABLE lesson_materials (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('pdf', 'docx')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  page_count INTEGER,
  preview_warning INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);
CREATE INDEX lesson_materials_lesson ON lesson_materials(lesson_id, removed_at);
