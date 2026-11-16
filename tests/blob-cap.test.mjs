import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// The real @vercel/blob SDK against a local store that never answers: our caps must still return.
const server = createServer(() => {}); // accept, never respond
await new Promise(r => server.listen(0, '127.0.0.1', r));
Object.assign(process.env, {
  VERCEL_BLOB_API_URL: `http://127.0.0.1:${server.address().port}`,
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_teststore_notarealsecret',
});
const { list } = await import('@vercel/blob');
const { within, archive } = await import('../src/seen.mjs');

const timed = async p => { const t = Date.now(); await p.catch(() => {}); return Date.now() - t; };

test('within() caps a hung Blob call', { timeout: 5000 }, async () => {
  const ms = await timed(within(300, abortSignal => list({ prefix: 'seen/x/', limit: 1, abortSignal })));
  assert.ok(ms < 1500, `took ${ms} ms`);
});

test('archive() never holds a reply more than ~3 s on a hung store', { timeout: 8000 }, async () => {
  const ms = await timed(archive('gatekeeper', { task_id: 't' }, {}));
  assert.ok(ms < 4000, `took ${ms} ms`);
});

test.after(() => { server.closeAllConnections(); server.close(); });
