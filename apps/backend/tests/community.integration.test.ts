import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { MongoClient } from 'mongodb';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createCommunityRouter } from '../src/community/router.js';

// Each run creates and drops only its own uniquely named test database.
test('community persistence, authorization, uploads, recovery, and moderation', async t => {
  const client = new MongoClient(process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  const db = client.db(`oathkeeper_test_${randomUUID().replaceAll('-', '')}`);
  const directory = await mkdtemp(join(tmpdir(), 'oathkeeper-test-'));
  const app = express(); app.use(express.json({ limit: '32kb' }));
  app.use('/api/community', await createCommunityRouter(db, { directory, moderator: 'owner', storageLimit: 100 }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/community`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.dropDatabase(); await client.close(); await rm(directory, { recursive: true, force: true }); });
  const cookies: Record<string, string> = {};
  async function request(path: string, who = '', method = 'GET', body?: unknown, expected = 200, extra: Record<string, string> = {}) {
    const response = await fetch(url + path, { method, headers: { 'X-Oathkeeper-Request': '1', ...(body instanceof Buffer ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' }), ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...extra }, body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    if (response.headers.get('set-cookie')) cookies[who] = response.headers.get('set-cookie')!.split(';')[0];
    return data;
  }
  for (const name of ['owner', 'member', 'outsider']) await request('/register', name, 'POST', { username: name, password: 'a secure test password' });
  const owner = (await request('/session', 'owner')).user;
  const member = (await request('/session', 'member')).user;
  assert.equal(owner.moderator, true);
  assert.equal((await db.collection('users').findOne({ username: 'owner' }))?.password.includes('a secure'), false);
  await request('/register', 'outsider', 'POST', { username: 'owner', password: 'a secure test password' }, 409);
  await request('/login', 'nobody', 'POST', { username: 'owner', password: 'the wrong password' }, 401);
  await request('/groups', '', 'POST', { name: 'No access' }, 401);
  await request('/groups', 'owner', 'POST', { name: 'CSRF' }, 403, { 'X-Oathkeeper-Request': '' });
  const group = await request('/groups', 'owner', 'POST', { name: 'The party' }, 201);
  await request(`/groups/${group._id}/join`, 'outsider', 'POST', {}, 404);
  await request(`/groups/${group._id}/invitations`, 'owner', 'POST', { username: 'member' });
  assert.equal((await request('/groups', 'member')).invitations[0]._id, group._id);
  await request(`/groups/${group._id}/join`, 'member', 'POST', {});
  await request(`/groups/${group._id}/invitations`, 'member', 'POST', { username: 'outsider' }, 403);
  const privatePost = await request('/posts', 'member', 'POST', { groupId: group._id, text: 'Private map' }, 201);
  const bytes = Buffer.from('private campaign map');
  const attachment = await request(`/posts/${privatePost._id}/files`, 'member', 'POST', bytes, 201, { 'X-File-Name': 'map.pdf', 'X-File-Type': 'application/pdf' });
  await request(`/posts/${privatePost._id}/publish`, 'member', 'POST', {});
  assert.equal((await request('/posts', '')).length, 0);
  await request(`/posts?groupId=${group._id}`, '', 'GET', undefined, 404);
  await request(`/posts?groupId=${group._id}`, 'outsider', 'GET', undefined, 404);
  await request(`/files/${attachment._id}`, 'outsider', 'GET', undefined, 404);
  const download = await fetch(`${url}/files/${attachment._id}`, { headers: { Cookie: cookies.member } });
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition')!, /^attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  const range = await fetch(`${url}/files/${attachment._id}`, { headers: { Cookie: cookies.member, Range: 'bytes=0-6' } });
  assert.equal(range.status, 206); assert.equal(await range.text(), 'private');
  const comment = await request(`/posts/${privatePost._id}/comments`, 'member', 'POST', { text: 'A comment' }, 201);
  await request(`/posts/${privatePost._id}/comments`, 'outsider', 'GET', undefined, 404);
  await request(`/posts/${privatePost._id}/comments/${comment._id}`, 'owner', 'DELETE');
  await request(`/groups/${group._id}/messages`, 'member', 'POST', { text: '   ' }, 400);
  const message = await request(`/groups/${group._id}/messages`, 'member', 'POST', { text: 'Meet at seven' }, 201);
  assert.equal((await request(`/groups/${group._id}/messages`, 'owner'))[0].text, 'Meet at seven');
  await request(`/groups/${group._id}/messages`, 'outsider', 'GET', undefined, 404);
  await request(`/groups/${group._id}/members/${owner.id}`, 'owner', 'DELETE', undefined, 400);
  await request(`/groups/${group._id}/members/${member.id}`, 'member', 'DELETE', undefined, 403);
  await request(`/groups/${group._id}/members/${member.id}`, 'owner', 'DELETE');
  await request(`/files/${attachment._id}`, 'member', 'GET', undefined, 404);
  await request(`/groups/${group._id}/messages`, 'member', 'POST', { text: 'No longer allowed' }, 404);
  await request(`/groups/${group._id}/messages/${message._id}`, 'owner', 'DELETE');
  await request(`/posts/${privatePost._id}`, 'owner', 'DELETE');
  assert.equal((await request('/session', 'owner')).storageUsed, 0);
  assert.deepEqual(await readdir(directory), []);

  const post = await request('/posts', 'owner', 'POST', { text: 'Public news' }, 201);
  await request(`/posts/${post._id}/publish`, 'outsider', 'POST', {}, 404);
  await request(`/posts/${post._id}/publish`, 'owner', 'POST', {});
  assert.equal((await request('/posts'))[0].text, 'Public news');
  await request(`/posts/${post._id}`, 'outsider', 'DELETE', undefined, 403);
  await request(`/posts/${post._id}/report`, 'outsider', 'POST', { reason: 'Please review this post' }, 201);
  await request(`/posts/${post._id}/report`, 'outsider', 'POST', { reason: 'Again' }, 409);
  await request('/reports', 'member', 'GET', undefined, 403);
  const report = (await request('/reports', 'owner'))[0];
  await request(`/reports/${report._id}/resolve`, 'owner', 'POST', { remove: true });
  assert.equal((await request('/posts')).length, 0);

  const draft = await request('/posts', 'owner', 'POST', {}, 201);
  await request(`/posts/${draft._id}/publish`, 'owner', 'POST', {}, 400);
  await request(`/posts/${draft._id}/files`, 'owner', 'POST', Buffer.alloc(101), 413, { 'X-File-Name': 'big.bin' });
  assert.equal((await request('/session', 'owner')).storageUsed, 0);
  const first = await request(`/posts/${draft._id}/files`, 'owner', 'POST', Buffer.alloc(60), 201, { 'X-File-Name': 'one.bin' });
  await request(`/posts/${draft._id}/files`, 'owner', 'POST', Buffer.alloc(41), 413, { 'X-File-Name': 'two.bin' });
  assert.equal((await request('/session', 'owner')).storageUsed, 60);
  await request(`/posts/${draft._id}/publish`, 'owner', 'POST', {});
  // Reinitialize against the same persistent storage, as on restart.
  await createCommunityRouter(db, { directory });
  assert.equal((await request('/posts'))[0]._id, draft._id);
  assert.equal((await request('/session', 'owner')).storageUsed, 60);
  assert.equal((await fetch(`${url}/files/${first._id}`)).status, 200);
  await request(`/posts/${draft._id}`, 'owner', 'DELETE');
  const abandoned = await request('/posts', 'owner', 'POST', {}, 201);
  await request(`/posts/${abandoned._id}/files`, 'owner', 'POST', Buffer.alloc(10), 201, { 'X-File-Name': 'abandoned.bin' });
  await createCommunityRouter(db, { directory });
  assert.equal((await request('/session', 'owner')).storageUsed, 0);
  assert.deepEqual(await readdir(directory), []);
  const failedDraft = await request('/posts', 'owner', 'POST', { text: 'Failure recovery' }, 201);
  await request(`/posts/${failedDraft._id}/files`, 'owner', 'POST', Buffer.alloc(0), 400, { 'X-File-Name': 'empty.txt' });
  // Reject oversized declared files before receiving their body.
  for (const [name, size] of [['huge.png', 100_000_001], ['huge.mp4', 500_000_001], ['huge.pdf', 1_000_000_001]] as const) {
    const status = await new Promise<number>(resolve => {
      const req = httpRequest(`${url}/posts/${failedDraft._id}/files`, { method: 'POST', headers: { Cookie: cookies.owner, 'X-Oathkeeper-Request': '1', 'X-File-Name': name, 'Content-Type': 'application/octet-stream', 'Content-Length': size } }, res => { res.resume(); resolve(res.statusCode!); req.destroy(); });
      req.on('error', () => {}); req.flushHeaders();
    });
    assert.equal(status, 413);
  }
  // Disconnect after reserving space and sending only part of a file.
  await new Promise<void>(resolve => {
    const req = httpRequest(`${url}/posts/${failedDraft._id}/files`, { method: 'POST', headers: { Cookie: cookies.owner, 'X-Oathkeeper-Request': '1', 'X-File-Name': 'interrupted.bin', 'Content-Type': 'application/octet-stream', 'Content-Length': 80 } });
    req.on('error', () => {}); req.write(Buffer.alloc(10));
    setTimeout(() => { req.destroy(); resolve(); }, 100);
  });
  for (let i = 0; i < 30 && (await request('/session', 'owner')).storageUsed !== 0; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await request('/session', 'owner')).storageUsed, 0);
  // Concurrent reservations cannot exceed the global cap.
  const secondDraft = await request('/posts', 'owner', 'POST', { text: 'Parallel reservation' }, 201);
  const parallel = await Promise.all([failedDraft._id, secondDraft._id].map(async id => {
    const response = await fetch(`${url}/posts/${id}/files`, { method: 'POST', headers: { Cookie: cookies.owner, 'X-Oathkeeper-Request': '1', 'X-File-Name': 'parallel.bin', 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(60) });
    await response.json(); return response.status;
  }));
  assert.deepEqual(parallel.sort(), [201, 413]);
  await request(`/posts/${failedDraft._id}`, 'owner', 'DELETE');
  await request(`/posts/${secondDraft._id}`, 'owner', 'DELETE');
  assert.equal((await request('/session', 'owner')).storageUsed, 0);
  await request('/logout', 'owner', 'POST', {});
  assert.equal((await request('/session', 'owner')).user, null);
  await request('/login', 'owner', 'POST', { username: 'owner', password: 'a secure test password' });
  assert.equal((await request('/session', 'owner')).user.id, owner.id);
});
