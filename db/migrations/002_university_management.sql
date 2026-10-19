ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'blocked'));
ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN academic_title TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX one_super_admin ON users(role) WHERE role = 'admin';

CREATE TABLE platform_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  site_name TEXT NOT NULL DEFAULT 'BilimHub',
  institution_name TEXT NOT NULL DEFAULT 'Университет',
  announcement TEXT NOT NULL DEFAULT '',
  registration_open INTEGER NOT NULL DEFAULT 1 CHECK(registration_open IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id)
);
CREATE TABLE academic_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  academic_year TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK(semester IN (1,2,3)),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at INTEGER NOT NULL
);
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES academic_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(group_id, user_id)
);
CREATE TABLE group_courses (
  group_id TEXT NOT NULL REFERENCES academic_groups(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY(group_id, course_id)
);
CREATE TABLE group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES academic_groups(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL CHECK(max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX academic_groups_owner ON academic_groups(owner_id, status);
CREATE INDEX group_members_user ON group_members(user_id);
CREATE INDEX group_courses_course ON group_courses(course_id);
