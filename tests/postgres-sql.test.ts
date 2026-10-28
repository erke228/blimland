import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresSql } from '../src/lib/postgres-sql';
test('PostgreSQL placeholders preserve literal question marks and escaped quotes', () => {
  assert.equal(
    postgresSql("SELECT '?' literal, 'it''s ?' text, \"?\" FROM courses WHERE id=? AND title=?"),
    "SELECT '?' literal, 'it''s ?' text, \"?\" FROM courses WHERE id=$1 AND title=$2",
  );
});
test('Idempotent inserts keep values parameterized on PostgreSQL', () => {
  assert.equal(
    postgresSql('INSERT OR IGNORE INTO enrollments VALUES(?,?,?);'),
    'INSERT INTO enrollments VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
  );
  assert.equal(
    postgresSql('INSERT OR IGNORE INTO enrollments SELECT ?,c.id,? FROM courses c WHERE c.id=?'),
    'INSERT INTO enrollments SELECT $1,c.id,$2 FROM courses c WHERE c.id=$3 ON CONFLICT DO NOTHING',
  );
});
