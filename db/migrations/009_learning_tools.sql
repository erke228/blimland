CREATE TABLE lesson_quizzes (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  pass_points INTEGER NOT NULL CHECK(pass_points >= 0),
  suggested_minutes INTEGER NOT NULL DEFAULT 20,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL
);
CREATE TABLE quiz_questions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lesson_quizzes(lesson_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('single_choice','short_answer')),
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer_json TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 10),
  UNIQUE(lesson_id,position)
);
CREATE TABLE quiz_attempts (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lesson_quizzes(lesson_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_version INTEGER NOT NULL,
  submission_key TEXT NOT NULL,
  submitted_at BIGINT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('awaiting_review','graded')),
  points INTEGER NOT NULL,
  max_points INTEGER NOT NULL,
  pass_points INTEGER NOT NULL,
  UNIQUE(user_id,lesson_id,submission_key)
);
CREATE INDEX quiz_attempts_user_lesson ON quiz_attempts(user_id,lesson_id,submitted_at);
CREATE TABLE quiz_answers (
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question_snapshot TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  points_awarded INTEGER,
  feedback TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at BIGINT,
  PRIMARY KEY(attempt_id,question_id)
);
CREATE TABLE lesson_practices (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  starter_code TEXT NOT NULL,
  full_code TEXT NOT NULL,
  requirements TEXT NOT NULL,
  expected_output TEXT NOT NULL DEFAULT ''
);
CREATE TABLE lesson_videos (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  duration_ms INTEGER NOT NULL CHECK(duration_ms BETWEEN 1 AND 90000),
  size_bytes BIGINT NOT NULL CHECK(size_bytes > 0),
  sha256 TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL
);
