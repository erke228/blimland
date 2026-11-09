import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { all, migrate, one, run } from '../src/lib/db';
import {
  reserveDirectVideoUpload,
  finalizeDirectVideoUpload,
  cancelDirectVideoUpload,
} from '../src/lib/direct-video-uploads';
import { mp4Fixture } from './video-fixtures';

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((done) => {
    release = done;
  });
  return { wait, release };
}

test(
  'finalization rechecks authority after actual object write and cleans denied final objects',
  { timeout: 20000 },
  async (context) => {
    process.env.DATABASE_DRIVER = 'sqlite';
    process.env.DATABASE_PATH = ':memory:';
    process.env.STORAGE_DRIVER = 'neon';
    process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'true';
    process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
    await migrate();
    const objects = new Map<string, Buffer>();
    let written = gate(),
      allowResponse = gate();
    const server = createServer(async (req, res) => {
      const path = new URL(req.url!, 'http://localhost').pathname;
      if (req.method === 'GET') {
        const bytes = objects.get(path);
        if (!bytes) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Length': String(bytes.length) }).end(bytes);
      } else if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        objects.set(path, Buffer.concat(chunks));
        written.release();
        await allowResponse.wait;
        res.writeHead(200, { ETag: '"fixture"' }).end();
      } else if (req.method === 'DELETE') {
        objects.delete(path);
        res.writeHead(204).end();
      } else res.writeHead(405).end();
    });
    context.signal.addEventListener(
      'abort',
      () => {
        written.release();
        allowResponse.release();
        server.closeAllConnections();
      },
      { once: true },
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.AWS_ACCESS_KEY_ID = 'fixture-race-access';
    process.env.AWS_SECRET_ACCESS_KEY = 'fixture-race-secret';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_MAX_ATTEMPTS = '1';
    async function fixture() {
      const owner = randomUUID(),
        course = randomUUID(),
        section = randomUUID(),
        lesson = randomUUID();
      await run(
        'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
        owner,
        `${owner}@race.invalid`,
        'Fixture',
        'unused',
        'teacher',
        Date.now(),
      );
      await run(
        'INSERT INTO courses(id,owner_id,title,description,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        course,
        owner,
        'Race fixture',
        'Fixture',
        'STEM',
        'draft',
        Date.now(),
        Date.now(),
      );
      await run('INSERT INTO sections VALUES(?,?,?,?)', section, course, 'Section', 0);
      await run(
        'INSERT INTO lessons(id,section_id,title,position) VALUES(?,?,?,?)',
        lesson,
        section,
        'Lecture',
        0,
      );
      const bytes = mp4Fixture(),
        row = await reserveDirectVideoUpload(owner, lesson, randomUUID(), bytes.length);
      objects.set(`/bilimhub-files/videos/${row.storage_key}`, bytes);
      return { owner, course, lesson, bytes, row };
    }
    try {
      for (const change of [
        'published',
        'new-owner',
        'blocked',
        'cancelled',
        'quota',
        'disabled',
      ]) {
        const f = await fixture();
        written = gate();
        allowResponse = gate();
        const before = objects.size;
        const pending = finalizeDirectVideoUpload(f.owner, f.row.id);
        // Attach rejection handling before deliberately suspending the upload response.
        const rejected = assert.rejects(pending, {
          code:
            change === 'published'
              ? 'readonly'
              : change === 'cancelled'
                ? 'directuploadexpired'
                : change === 'quota'
                  ? 'videoquota'
                  : change === 'disabled'
                    ? 'directuploadunavailable'
                    : 'forbidden',
        });
        await written.wait;
        assert.equal(objects.size, before + 1);
        const attempt = await one<{ storage_key: string; state: string }>(
          'SELECT storage_key,state FROM direct_video_final_objects WHERE reservation_id=?',
          f.row.id,
        );
        assert.equal(attempt!.state, 'pending');
        assert(objects.has(`/bilimhub-files/videos/${attempt!.storage_key}`));
        try {
          if (change === 'published')
            await run("UPDATE courses SET status='published' WHERE id=?", f.course);
          if (change === 'new-owner') {
            const replacement = await fixture();
            await run('UPDATE courses SET owner_id=? WHERE id=?', replacement.owner, f.course);
          }
          if (change === 'blocked')
            await run("UPDATE users SET status='blocked' WHERE id=?", f.owner);
          if (change === 'cancelled') await cancelDirectVideoUpload(f.owner, f.row.id);
          if (change === 'quota') process.env.VIDEO_COURSE_QUOTA_BYTES = '1';
          if (change === 'disabled') process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'false';
        } finally {
          allowResponse.release();
        }
        await rejected;
        assert.equal(
          (await one<{ state: string }>(
            'SELECT state FROM direct_video_final_objects WHERE storage_key=?',
            attempt!.storage_key,
          ))!.state,
          'pending',
        );
        process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
        process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'true';
        assert.equal(
          await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', f.lesson),
          undefined,
        );
        const journal = await one<{ state: string }>(
          'SELECT state FROM direct_video_uploads WHERE id=?',
          f.row.id,
        );
        assert.equal(journal!.state, change === 'cancelled' ? 'abandoned' : 'pending');
        assert.equal(
          (await one<{ n: number }>(
            "SELECT COUNT(*) n FROM audit_log WHERE target_id=? AND action='lesson.video_uploaded'",
            f.lesson,
          ))!.n,
          0,
        );
        // Only staging keys should remain; every denied final UUID is removed over HTTP.
        const journals = await all<{ storage_key: string }>(
          'SELECT storage_key FROM direct_video_uploads',
        );
        const staging = new Set(journals.map((j) => `/bilimhub-files/videos/${j.storage_key}`));
        assert([...objects.keys()].every((key) => staging.has(key)));
      }
      const f = await fixture();
      written = gate();
      allowResponse = gate();
      allowResponse.release();
      const video = await finalizeDirectVideoUpload(f.owner, f.row.id);
      assert.deepEqual(objects.get(`/bilimhub-files/videos/${video.storage_key}`), f.bytes);
      assert.notEqual(video.storage_key, f.row.storage_key);
      assert.equal(
        (await one<{ state: string }>(
          'SELECT state FROM direct_video_uploads WHERE id=?',
          f.row.id,
        ))!.state,
        'attached',
      );
    } finally {
      allowResponse.release();
      server.closeAllConnections();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    }
  },
);
