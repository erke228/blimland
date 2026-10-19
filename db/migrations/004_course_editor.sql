CREATE TABLE course_presentation (
  course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'books',
  cover_key TEXT,
  cover_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE lesson_details (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT ''
);
