-- A failed/aborted PUT can finish remotely after a successful DELETE.
-- Retain every final attempt key independently of course/user lifetime for later reaping.
CREATE TABLE direct_video_final_objects (
  storage_key TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','attached')),
  created_at BIGINT NOT NULL
);
CREATE INDEX direct_video_final_reservation ON direct_video_final_objects(reservation_id,state);
