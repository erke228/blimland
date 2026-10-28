CREATE TABLE course_trash (
  course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  removed_at INTEGER NOT NULL,
  removed_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE course_cover_files (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY(course_id,storage_key)
);
INSERT OR IGNORE INTO course_cover_files SELECT course_id,cover_key FROM course_presentation WHERE cover_key IS NOT NULL;
INSERT OR IGNORE INTO course_cover_files SELECT s.course_id,p.cover_key FROM lesson_presentation p JOIN lessons l ON l.id=p.lesson_id JOIN sections s ON s.id=l.section_id WHERE p.cover_key IS NOT NULL;
CREATE TABLE file_deletions (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('material','preview','cover')),
  created_at INTEGER NOT NULL
);
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  university TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  avatar_version INTEGER NOT NULL DEFAULT 0
);
