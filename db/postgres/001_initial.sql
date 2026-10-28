-- PostgreSQL equivalent of SQLite migrations 001–008. Existing SQLite files stay immutable.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  created_at BIGINT NOT NULL
, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'blocked')), department TEXT NOT NULL DEFAULT '', academic_title TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL DEFAULT 0, last_active_at BIGINT NOT NULL DEFAULT 0);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE teacher_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL,
  reviewed_at BIGINT
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'Бастапқы',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'published', 'archived')),
  accent TEXT NOT NULL DEFAULT 'teal' CHECK(accent IN ('teal', 'violet', 'amber', 'blue')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position BIGINT NOT NULL
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  duration_minutes BIGINT NOT NULL DEFAULT 10 CHECK(duration_minutes > 0),
  position BIGINT NOT NULL,
  is_preview BIGINT NOT NULL DEFAULT 0 CHECK(is_preview IN (0,1))
);

CREATE TABLE enrollments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(user_id, course_id)
);

CREATE TABLE lesson_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at BIGINT,
  video_position DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, lesson_id)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count BIGINT NOT NULL,
  reset_at BIGINT NOT NULL
);

CREATE INDEX sections_course ON sections(course_id, position);

CREATE INDEX lessons_section ON lessons(section_id, position);

CREATE INDEX courses_status ON courses(status);

CREATE UNIQUE INDEX one_super_admin ON users(role) WHERE role = 'admin';

CREATE TABLE platform_settings (
  id BIGINT PRIMARY KEY CHECK(id = 1),
  site_name TEXT NOT NULL DEFAULT 'BilimHub',
  institution_name TEXT NOT NULL DEFAULT 'Университет',
  announcement TEXT NOT NULL DEFAULT '',
  registration_open BIGINT NOT NULL DEFAULT 1 CHECK(registration_open IN (0,1)),
  updated_at BIGINT NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE academic_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  academic_year TEXT NOT NULL,
  semester BIGINT NOT NULL CHECK(semester IN (1,2,3)),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at BIGINT NOT NULL
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES academic_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE group_courses (
  group_id TEXT NOT NULL REFERENCES academic_groups(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at BIGINT NOT NULL,
  PRIMARY KEY(group_id, course_id)
);

CREATE TABLE group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES academic_groups(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  max_uses BIGINT NOT NULL CHECK(max_uses > 0),
  uses BIGINT NOT NULL DEFAULT 0 CHECK(uses >= 0),
  created_at BIGINT NOT NULL,
  revoked_at BIGINT
);

CREATE INDEX academic_groups_owner ON academic_groups(owner_id, status);

CREATE INDEX group_members_user ON group_members(user_id);

CREATE INDEX group_courses_course ON group_courses(course_id);

CREATE TABLE lesson_materials (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('pdf', 'docx')),
  size_bytes BIGINT NOT NULL CHECK(size_bytes > 0),
  page_count BIGINT,
  preview_warning BIGINT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  removed_at BIGINT
);

CREATE INDEX lesson_materials_lesson ON lesson_materials(lesson_id, removed_at);

CREATE TABLE course_presentation (
  course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'books',
  cover_key TEXT,
  cover_version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE lesson_details (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT ''
);

CREATE TABLE lesson_presentation (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'books',
  cover_key TEXT,
  cover_version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE section_trash (
  section_id TEXT PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
  removed_at BIGINT NOT NULL
);

CREATE TABLE course_trash (
  course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  removed_at BIGINT NOT NULL,
  removed_by TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE course_cover_files (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY(course_id,storage_key)
);

CREATE TABLE file_deletions (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('material','preview','cover')),
  created_at BIGINT NOT NULL
);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  university TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  avatar_version BIGINT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX users_email_lower ON users(lower(email));
