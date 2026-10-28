CREATE TABLE section_trash (
  section_id TEXT PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
  removed_at INTEGER NOT NULL
);
