-- Resource IDs are snapshots, not cascading FKs: an upload journal must survive
-- deletion of a course/user until outstanding signed URLs and objects are cleaned.
CREATE TABLE direct_video_uploads (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  expected_bytes BIGINT NOT NULL CHECK(expected_bytes > 0 AND expected_bytes <= 83886080),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','attached','abandoned','cleaned')),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL CHECK(expires_at > created_at),
  UNIQUE(actor_id,request_key)
);
CREATE INDEX direct_video_quota ON direct_video_uploads(course_id,state,expires_at);
