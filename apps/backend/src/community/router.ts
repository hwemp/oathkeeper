import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileLimit, previewType, STORAGE_LIMIT, canDelete } from './policy.js';

const derive = promisify(scrypt);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new ApiError(status, message); }
function text(value: unknown, max: number, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Check the required fields and their lengths.');
  return value.trim();
}
interface User { _id: string; username: string; salt: string; password: string }
interface Session { _id: string; userId: string; expires: Date }
interface Group { _id: string; name: string; ownerId: string; members: string[]; invited: string[] }
interface Post { _id: string; authorId: string; author: string; groupId: string | null; text: string; created: Date; draft: boolean; deleted: boolean }
interface Entry { _id: string; authorId: string; author: string; text: string; created: Date; parentId: string }
interface FileRecord { _id: string; postId: string; name: string; size: number; preview: string | null; ready: boolean; created: Date }
interface Report { _id: string; postId: string; reporterId: string; reason: string; created: Date; resolved: boolean }
interface Options { directory: string | null; secureCookies?: boolean; moderator?: string; storageLimit?: number }

interface Friendship { _id: string; members: string[]; senderId: string; accepted: boolean }
interface Block { _id: string; ownerId: string; targetId: string }
interface SafetyReport { _id: string; reporterId: string; kind: 'user' | 'direct' | 'group'; targetId: string; targetUserId: string; reason: string; evidence: string; created: Date; resolved: boolean }

export async function createCommunityRouter(db: Db, options: Options) {
  const router = Router();
  const users = db.collection<User>('users');
  const sessions = db.collection<Session>('sessions');
  const groups = db.collection<Group>('groups');
  const posts = db.collection<Post>('posts');
  const comments = db.collection<Entry>('comments');
  const messages = db.collection<Entry>('messages');
  const files = db.collection<FileRecord>('files');
  const reports = db.collection<Report>('reports');
  const friends = db.collection<Friendship>('friendships');
  const blocks = db.collection<Block>('blocks');
  const direct = db.collection<Entry>('directMessages');
  const safetyReports = db.collection<SafetyReport>('safetyReports');
  const storage = db.collection<{ _id: string; used: number }>('storage');
  const limit = options.storageLimit ?? STORAGE_LIMIT;
  const directory = options.directory ? resolve(options.directory) : null;
  if (directory) await mkdir(directory, { recursive: true, mode: 0o700 });
  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true }),
    sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),
    posts.createIndex({ groupId: 1, created: -1 }),
    comments.createIndex({ parentId: 1, created: -1 }),
    messages.createIndex({ parentId: 1, created: -1 }),
    files.createIndex({ postId: 1 }),
    friends.createIndex({ members: 1 }),
    blocks.createIndex({ ownerId: 1, targetId: 1 }, { unique: true }),
    direct.createIndex({ parentId: 1, created: -1 }),
  ]);
  await storage.updateOne({ _id: 'files' }, { $setOnInsert: { used: 0 } }, { upsert: true });
  const attempts = new Map<string, { count: number; expires: number }>();
  const activePosts = new Set<string>();
  // A post cannot be published/deleted or accept another file while an upload
  // is writing. Capacity is still reserved atomically across different posts.
  const exclusivePost = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (activePosts.has(id)) fail(409, 'This post has an upload in progress. Wait for it to finish or cancel it first.');
    activePosts.add(id);
    try { await handler(req, res); } finally { activePosts.delete(id); }
  };
  const cookie = (res: Response, token: string, maxAge: number) => res.cookie('oathkeeper_session', token, { httpOnly: true, sameSite: 'lax', secure: options.secureCookies ?? false, path: '/api', maxAge });

  router.use(async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Oathkeeper-Request') !== '1') fail(403, 'Please use the Oathkeeper app to make changes.');
      const token = (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith('oathkeeper_session='))?.slice(19);
      const session = token && await sessions.findOne({ _id: hash(token), expires: { $gt: new Date() } });
      res.locals.user = session ? await users.findOne({ _id: session.userId }) : null;
      next();
    } catch (error) { next(error); }
  });
  const user = (res: Response): User => res.locals.user ?? fail(401, 'Sign in to continue.');
  const isModerator = (u: User | null) => !!u && !!options.moderator && u.username === options.moderator.toLowerCase();
  const pair = (a: string, b: string) => [a, b].sort().join(':');
  async function hiddenIds(u: User | null) {
    if (!u) return [];
    return (await blocks.find({ $or: [{ ownerId: u._id }, { targetId: u._id }] }).toArray()).map(b => b.ownerId === u._id ? b.targetId : b.ownerId);
  }
  async function allowed(a: string, b: string) {
    if (a === b) fail(400, 'Choose another user.');
    if (await blocks.findOne({ $or: [{ ownerId: a, targetId: b }, { ownerId: b, targetId: a }] })) fail(403, 'This interaction is unavailable.');
  }
  async function target(id: string) { return await users.findOne({ _id: id }) || fail(404, 'User not found.'); }
  async function member(groupId: string, u: User | null) {
    const group = u && await groups.findOne({ _id: groupId, members: u._id });
    return group || fail(404, 'Group not found or you are not a member.');
  }
  async function visiblePost(id: string, u: User | null) {
    const post = await posts.findOne({ _id: id, deleted: false });
    if (post && (await hiddenIds(u)).includes(post.authorId)) fail(404, 'Post not found.');
    if (!post || (post.draft && post.authorId !== u?._id)) fail(404, 'Post not found.');
    if (post.groupId) await member(post.groupId, u);
    return post;
  }
  async function view(post: Post, u: User | null) {
    const group = post.groupId ? await groups.findOne({ _id: post.groupId }) : null;
    return { ...post, canDelete: !!u && canDelete(post.authorId, u._id, group?.ownerId), files: await files.find({ postId: post._id, ready: true }).toArray() };
  }
  async function removeFiles(postId: string) {
    if (!directory) return;
    for (const file of await files.find({ postId }).toArray()) {
      try { await unlink(join(directory, file._id)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const removed = await files.deleteOne({ _id: file._id });
      if (removed.deletedCount) await storage.updateOne({ _id: 'files' }, { $inc: { used: -file.size } });
    }
  }
  async function deletePost(post: Post) {
    await posts.updateOne({ _id: post._id }, { $set: { deleted: true } });
    await removeFiles(post._id);
    await comments.deleteMany({ parentId: post._id });
    await reports.updateMany({ postId: post._id }, { $set: { resolved: true } });
  }
  // Recover interrupted uploads and abandoned drafts when this single-instance server starts.
  if (directory) {
    for (const file of await files.find({ ready: false }).toArray()) {
      try { await unlink(join(directory, file._id)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await files.deleteOne({ _id: file._id });
    }
    for (const post of await posts.find({ $or: [{ deleted: true }, { draft: true }] }).toArray()) await deletePost(post);
    const totals = await files.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$size' } } }]).toArray();
    await storage.updateOne({ _id: 'files' }, { $set: { used: totals[0]?.total ?? 0 } });
  }

  router.get('/session', async (_req, res) => {
    const u: User | null = res.locals.user;
    res.json({ user: u ? { id: u._id, username: u.username, moderator: isModerator(u) } : null, uploadsEnabled: !!directory, storageLimit: limit, storageUsed: (await storage.findOne({ _id: 'files' }))?.used ?? 0 });
  });
  for (const mode of ['register', 'login']) router.post(`/${mode}`, async (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires < now) attempts.delete(key);
    const key = req.ip ?? 'local';
    const attempt = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
    attempts.set(key, attempt);
    if (++attempt.count > 20) fail(429, 'Too many sign-in attempts. Wait a minute and try again.');
    const username = text(req.body?.username, 30).toLowerCase();
    const password = req.body?.password;
    if (!/^[a-z0-9_]{3,30}$/.test(username)) fail(400, 'Use 3–30 letters, numbers, or underscores for your username.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'Use a password between 12 and 128 characters.');
    let u = await users.findOne({ username });
    if (mode === 'register') {
      if (u) fail(409, 'That username is already taken.');
      const salt = randomBytes(16).toString('hex');
      u = { _id: randomUUID(), username, salt, password: (await derive(password, salt, 64) as Buffer).toString('hex') };
      try { await users.insertOne(u); } catch (error) { if ((error as { code?: number }).code === 11000) fail(409, 'That username is already taken.'); throw error; }
    } else {
      const candidate = await derive(password, u?.salt ?? 'missing-user', 64) as Buffer;
      if (!u || !timingSafeEqual(candidate, Buffer.from(u.password, 'hex'))) fail(401, 'Username or password is incorrect.');
    }
    const token = randomBytes(32).toString('hex');
    await sessions.insertOne({ _id: hash(token), userId: u._id, expires: new Date(Date.now() + 7 * 86400_000) });
    cookie(res, token, 7 * 86400_000);
    res.json({ ok: true });
  });
  router.post('/logout', async (req, res) => {
    const token = (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith('oathkeeper_session='))?.slice(19);
    if (token) await sessions.deleteOne({ _id: hash(token) });
    cookie(res, '', 0); res.json({ ok: true });
  });

  router.get('/groups', async (_req, res) => {
    const u = user(res);
    res.json({ groups: await groups.find({ members: u._id }).toArray(), invitations: (await groups.find({ invited: u._id }).toArray()).map(g => ({ _id: g._id, name: g.name })) });
  });
  router.post('/groups', async (req, res) => {
    const u = user(res);
    const group: Group = { _id: randomUUID(), name: text(req.body?.name, 80), ownerId: u._id, members: [u._id], invited: [] };
    await groups.insertOne(group); res.status(201).json(group);
  });
  router.post('/groups/:id/invitations', async (req, res) => {
    const u = user(res); const group = await member(String(req.params.id), u);
    if (group.ownerId !== u._id) fail(403, 'Only the group owner can invite members.');
    const target = await users.findOne({ username: text(req.body?.username, 30).toLowerCase() });
    if (!target) fail(404, 'No account has that username. Ask them to sign up first.');
    await allowed(u._id, target._id);
    if (group.members.includes(target._id)) fail(409, 'That person is already a member.');
    await groups.updateOne({ _id: group._id }, { $addToSet: { invited: target._id } }); res.json({ ok: true });
  });
  router.post('/groups/:id/join', async (req, res) => {
    const u = user(res);
    const result = await groups.updateOne({ _id: String(req.params.id), invited: u._id }, { $addToSet: { members: u._id }, $pull: { invited: u._id } });
    if (!result.matchedCount) fail(404, 'Invitation not found.');
    res.json({ ok: true });
  });
  router.get('/groups/:id/members', async (req, res) => {
    const group = await member(String(req.params.id), user(res));
    res.json(await users.find({ _id: { $in: group.members } }, { projection: { _id: 1, username: 1 } }).toArray());
  });
  router.delete('/groups/:id/members/:userId', async (req, res) => {
    const u = user(res); const group = await member(String(req.params.id), u);
    if (group.ownerId !== u._id) fail(403, 'Only the owner can remove members.');
    if (req.params.userId === u._id) fail(400, 'The group owner cannot be removed.');
    await groups.updateOne({ _id: group._id }, { $pull: { members: String(req.params.userId), invited: String(req.params.userId) } });
    res.json({ ok: true });
  });

  router.get('/posts', async (req, res) => {
    const groupId = typeof req.query.groupId === 'string' && req.query.groupId ? req.query.groupId : null;
    if (groupId) await member(groupId, res.locals.user);
    const found = await posts.find({ groupId, draft: false, deleted: false, authorId: { $nin: await hiddenIds(res.locals.user) } }).sort({ created: -1 }).limit(50).toArray();
    res.json(await Promise.all(found.map(post => view(post, res.locals.user))));
  });
  router.post('/posts', async (req, res) => {
    const u = user(res); const groupId = req.body?.groupId ? text(req.body.groupId, 100) : null;
    if (groupId) await member(groupId, u);
    const post: Post = { _id: randomUUID(), authorId: u._id, author: u.username, text: text(req.body?.text ?? '', 10_000, false), groupId, created: new Date(), draft: true, deleted: false };
    await posts.insertOne(post); res.status(201).json(post);
  });
  router.post('/posts/:id/publish', exclusivePost(async (req, res) => {
    const u = user(res); const post = await visiblePost(String(req.params.id), u);
    if (post.authorId !== u._id) fail(403, 'Only the author can publish this post.');
    if (!post.text && !(await files.countDocuments({ postId: post._id, ready: true }))) fail(400, 'Add text or a file before posting.');
    if (await files.countDocuments({ postId: post._id, ready: false })) fail(409, 'Wait for uploads to finish.');
    await posts.updateOne({ _id: post._id, deleted: false }, { $set: { draft: false } }); res.json({ ok: true });
  }));
  router.delete('/posts/:id', exclusivePost(async (req, res) => {
    const u = user(res); const post = await visiblePost(String(req.params.id), u);
    const group = post.groupId ? await member(post.groupId, u) : null;
    if (!canDelete(post.authorId, u._id, group?.ownerId)) fail(403, 'Only the author or group owner can delete this post.');
    await deletePost(post); res.json({ ok: true });
  }));
  router.get('/posts/:id/comments', async (req, res) => {
    const post = await visiblePost(String(req.params.id), res.locals.user);
    res.json((await comments.find({ parentId: post._id, authorId: { $nin: await hiddenIds(res.locals.user) } }).sort({ created: -1 }).limit(100).toArray()).reverse());
  });
  router.post('/posts/:id/comments', async (req, res) => {
    const u = user(res); const post = await visiblePost(String(req.params.id), u);
    if (post.draft) fail(400, 'Publish the post first.');
    const entry: Entry = { _id: randomUUID(), parentId: post._id, authorId: u._id, author: u.username, text: text(req.body?.text, 4000), created: new Date() };
    await comments.insertOne(entry); res.status(201).json(entry);
  });
  router.delete('/posts/:id/comments/:commentId', async (req, res) => {
    const u = user(res); const post = await visiblePost(String(req.params.id), u);
    const group = post.groupId ? await member(post.groupId, u) : null;
    const entry = await comments.findOne({ _id: String(req.params.commentId), parentId: post._id });
    if (!entry) fail(404, 'Comment not found.');
    if (!canDelete(entry.authorId, u._id, group?.ownerId)) fail(403, 'You cannot remove this comment.');
    await comments.deleteOne({ _id: entry._id }); res.json({ ok: true });
  });
  router.get('/groups/:id/messages', async (req, res) => {
    const group = await member(String(req.params.id), user(res));
    res.json((await messages.find({ parentId: group._id, authorId: { $nin: await hiddenIds(user(res)) } }).sort({ created: -1 }).limit(100).toArray()).reverse());
  });
  router.post('/groups/:id/messages', async (req, res) => {
    const u = user(res); const group = await member(String(req.params.id), u);
    const entry: Entry = { _id: randomUUID(), parentId: group._id, authorId: u._id, author: u.username, text: text(req.body?.text, 4000), created: new Date() };
    await messages.insertOne(entry); res.status(201).json(entry);
  });
  router.delete('/groups/:id/messages/:messageId', async (req, res) => {
    const u = user(res); const group = await member(String(req.params.id), u);
    const entry = await messages.findOne({ _id: String(req.params.messageId), parentId: group._id });
    if (!entry) fail(404, 'Message not found.');
    if (!canDelete(entry.authorId, u._id, group.ownerId)) fail(403, 'You cannot remove this message.');
    await messages.deleteOne({ _id: entry._id }); res.json({ ok: true });
  });

  router.get('/people', async (req, res) => {
    const u = user(res); const query = text(req.query.q ?? '', 30, false).toLowerCase();
    if (query.length < 3) { res.json([]); return; }
    const excluded = [u._id, ...await hiddenIds(u)];
    // Usernames contain only letters, numbers and underscores; reject regex syntax.
    if (!/^[a-z0-9_]+$/.test(query)) fail(400, 'Search using letters, numbers, or underscores.');
    res.json(await users.find({ username: { $regex: '^' + query }, _id: { $nin: excluded } }, { projection: { _id: 1, username: 1 } }).limit(30).toArray());
  });
  router.get('/friends', async (_req, res) => {
    const u = user(res);
    const rows = await friends.find({ members: u._id }).toArray();
    res.json(await Promise.all(rows.map(async row => {
      const other = await target(row.members.find(id => id !== u._id)!);
      return { _id: other._id, username: other.username, accepted: row.accepted, incoming: row.senderId !== u._id };
    })));
  });
  router.post('/friends/:userId', async (req, res) => {
    const u = user(res); const other = await target(String(req.params.userId)); await allowed(u._id, other._id);
    const id = pair(u._id, other._id);
    const existing = await friends.findOne({ _id: id });
    if (existing) fail(409, 'A friendship or request already exists.');
    try { await friends.insertOne({ _id: id, members: [u._id, other._id], senderId: u._id, accepted: false }); }
    catch (e) { if ((e as { code?: number }).code === 11000) fail(409, 'A request already exists.'); throw e; }
    res.status(201).json({ ok: true });
  });
  router.post('/friends/:userId/accept', async (req, res) => {
    const u = user(res); const id = String(req.params.userId); await allowed(u._id, id);
    const result = await friends.updateOne({ _id: pair(u._id, id), senderId: id, accepted: false }, { $set: { accepted: true } });
    if (!result.matchedCount) fail(404, 'Friend request not found.');
    res.json({ ok: true });
  });
  router.delete('/friends/:userId', async (req, res) => {
    const u = user(res); await friends.deleteOne({ _id: pair(u._id, String(req.params.userId)) }); res.json({ ok: true });
  });
  router.get('/blocks', async (_req, res) => {
    const u = user(res); const rows = await blocks.find({ ownerId: u._id }).toArray();
    res.json(await Promise.all(rows.map(async row => { const other = await target(row.targetId); return { _id: other._id, username: other.username }; })));
  });
  router.post('/blocks/:userId', async (req, res) => {
    const u = user(res); const other = await target(String(req.params.userId));
    if (u._id === other._id) fail(400, 'You cannot block yourself.');
    await blocks.updateOne({ ownerId: u._id, targetId: other._id }, { $setOnInsert: { _id: pair(u._id, other._id) + ':' + u._id, ownerId: u._id, targetId: other._id } }, { upsert: true });
    await friends.deleteOne({ _id: pair(u._id, other._id) });
    await groups.updateMany({ ownerId: other._id }, { $pull: { invited: u._id } });
    await groups.updateMany({ ownerId: u._id }, { $pull: { invited: other._id } });
    res.json({ ok: true });
  });
  router.delete('/blocks/:userId', async (req, res) => {
    await blocks.deleteOne({ ownerId: user(res)._id, targetId: String(req.params.userId) }); res.json({ ok: true });
  });
  async function conversation(res: Response, id: string) {
    const u = user(res); await target(id); await allowed(u._id, id);
    if (!await friends.findOne({ _id: pair(u._id, id), accepted: true })) fail(403, 'Accept a friend request before messaging.');
    return { u, id: pair(u._id, id) };
  }
  router.get('/direct/:userId', async (req, res) => {
    const c = await conversation(res, String(req.params.userId));
    const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
    if (before && !Number.isFinite(before.getTime())) fail(400, 'Invalid message cursor.');
    res.json((await direct.find({ parentId: c.id, ...(before ? { created: { $lt: before } } : {}) }).sort({ created: -1, _id: -1 }).limit(100).toArray()).reverse());
  });
  router.post('/direct/:userId', async (req, res) => {
    const c = await conversation(res, String(req.params.userId));
    const entry: Entry = { _id: randomUUID(), parentId: c.id, authorId: c.u._id, author: c.u.username, text: text(req.body?.text, 4000), created: new Date() };
    await direct.insertOne(entry); res.status(201).json(entry);
  });
  router.delete('/direct/:userId/:messageId', async (req, res) => {
    const u = user(res);
    const result = await direct.deleteOne({ _id: String(req.params.messageId), parentId: pair(u._id, String(req.params.userId)), authorId: u._id });
    if (!result.deletedCount) fail(404, 'Your message was not found.'); res.json({ ok: true });
  });
  router.post('/safety-reports', async (req, res) => {
    const u = user(res); const kind = req.body?.kind; const id = text(req.body?.targetId, 100);
    let evidence = ''; let targetUserId = id;
    if (kind === 'user') { const other = await target(id); evidence = other.username; }
    else if (kind === 'direct' || kind === 'group') {
      const entry = await (kind === 'direct' ? direct : messages).findOne({ _id: id });
      if (!entry) fail(404, 'Message not found.');
      if (kind === 'direct' && !entry.parentId.split(':').includes(u._id)) fail(404, 'Message not found.');
      if (kind === 'group') await member(entry.parentId, u);
      evidence = entry.author + ': ' + entry.text; targetUserId = entry.authorId;
    } else fail(400, 'Choose a user or message to report.');
    if (targetUserId === u._id) fail(400, 'You cannot report yourself.');
    if (await safetyReports.findOne({ reporterId: u._id, kind, targetId: id, resolved: false })) fail(409, 'This report is already awaiting review.');
    await safetyReports.insertOne({ _id: randomUUID(), reporterId: u._id, kind, targetId: id, targetUserId, evidence, reason: text(req.body?.reason, 2000), created: new Date(), resolved: false });
    res.status(201).json({ ok: true });
  });
  router.get('/safety-reports', async (_req, res) => {
    if (!isModerator(user(res))) fail(403, 'Only the configured moderator can review reports.');
    res.json(await safetyReports.find({ resolved: false }).sort({ created: 1 }).limit(100).toArray());
  });
  router.post('/safety-reports/:id/resolve', async (req, res) => {
    if (!isModerator(user(res))) fail(403, 'Only the configured moderator can review reports.');
    const report = await safetyReports.findOne({ _id: String(req.params.id), resolved: false });
    if (!report) fail(404, 'Report not found.');
    if (req.body?.remove === true) {
      if (report.kind === 'user') fail(400, 'User reports can be reviewed and dismissed; account suspension is not available yet.');
      await (report.kind === 'direct' ? direct : messages).deleteOne({ _id: report.targetId });
    }
    await safetyReports.updateOne({ _id: report._id }, { $set: { resolved: true } }); res.json({ ok: true });
  });

  router.post('/posts/:id/report', async (req, res) => {
    const u = user(res); const post = await visiblePost(String(req.params.id), u);
    if (post.groupId || post.draft) fail(400, 'Use reporting for published public posts.');
    const reason = text(req.body?.reason, 2000);
    if (await reports.findOne({ postId: post._id, reporterId: u._id, resolved: false })) fail(409, 'You have already reported this post.');
    await reports.insertOne({ _id: randomUUID(), postId: post._id, reporterId: u._id, reason, created: new Date(), resolved: false });
    res.status(201).json({ ok: true });
  });
  router.get('/reports', async (_req, res) => {
    if (!isModerator(user(res))) fail(403, 'Only the configured moderator can review reports.');
    const found = await reports.find({ resolved: false }).sort({ created: 1 }).limit(100).toArray();
    res.json(await Promise.all(found.map(async report => {
      const post = await posts.findOne({ _id: report.postId, groupId: null, deleted: false });
      return { ...report, post: post ? await view(post, res.locals.user) : null,
        comments: post ? await comments.find({ parentId: post._id, authorId: { $nin: await hiddenIds(res.locals.user) } }).sort({ created: -1 }).limit(100).toArray() : [] };
    })));
  });
  router.post('/reports/:id/resolve', async (req, res) => {
    if (!isModerator(user(res))) fail(403, 'Only the configured moderator can review reports.');
    const report = await reports.findOne({ _id: String(req.params.id), resolved: false });
    if (!report) fail(404, 'Report not found.');
    if (req.body?.remove === true) {
      const post = await posts.findOne({ _id: report.postId, groupId: null, deleted: false });
      if (post) await deletePost(post);
    }
    await reports.updateOne({ _id: report._id }, { $set: { resolved: true } }); res.json({ ok: true });
  });

  router.post('/posts/:id/files', exclusivePost(async (req, res) => {
    const u = user(res); const post = await visiblePost(String(req.params.id), u);
    if (!directory) fail(503, 'File storage is not configured on this server.');
    if (post.authorId !== u._id || !post.draft) fail(403, 'Files can only be added to your own unpublished post.');
    let name: string;
    try { name = decodeURIComponent(req.get('X-File-Name') ?? ''); } catch { fail(400, 'Invalid filename.'); }
    name = text(name, 200).replace(/[\\/\x00-\x1f\x7f]/g, '_');
    const declaredType = req.get('X-File-Type') ?? '';
    const size = Number(req.get('Content-Length'));
    if (!Number.isSafeInteger(size) || size <= 0) fail(400, 'The file must have a known, nonzero size.');
    if (size > fileLimit(name, declaredType)) fail(413, 'File too large: photos allow 100 MB, videos 500 MB, and other files 1 GB.');
    const reserved = await storage.findOneAndUpdate({ _id: 'files', ...(limit === null ? {} : { used: { $lte: limit - size } }) }, { $inc: { used: size } });
    if (!reserved) fail(413, 'Storage is full. Delete files from existing posts before uploading more.');
    const record: FileRecord = { _id: randomUUID(), postId: post._id, name, size, preview: null, ready: false, created: new Date() };
    let saved = false;
    try {
      await files.insertOne(record); saved = true;
      const handle = await open(join(directory, record._id), 'wx', 0o600);
      let received = 0; let first = Buffer.alloc(0);
      try {
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk); received += bytes.length;
          if (received > size) fail(413, 'The upload exceeded its declared size.');
          if (first.length < 32) first = Buffer.concat([first, bytes.subarray(0, 32 - first.length)]);
          // FileHandle.write can write fewer bytes than requested.
          let offset = 0;
          while (offset < bytes.length) { const result = await handle.write(bytes, offset, bytes.length - offset); offset += result.bytesWritten; }
        }
      } finally { await handle.close(); }
      if (received !== size) fail(400, 'Upload interrupted. Please try again.');
      record.preview = previewType(first);
      if (size > fileLimit(name, record.preview ?? declaredType)) fail(413, 'File content exceeds its media size limit.');
      await visiblePost(post._id, u);
      await files.updateOne({ _id: record._id }, { $set: { ready: true, preview: record.preview } });
      res.status(201).json({ ...record, ready: true });
    } catch (error) {
      if (saved) await removeFilesForFailedUpload(record);
      else await storage.updateOne({ _id: 'files' }, { $inc: { used: -size } });
      throw error;
    }
  }));
  async function removeFilesForFailedUpload(record: FileRecord) {
    if (!directory) return;
    try { await unlink(join(directory, record._id)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const removed = await files.deleteOne({ _id: record._id });
    if (removed.deletedCount) await storage.updateOne({ _id: 'files' }, { $inc: { used: -record.size } });
  }
  router.get('/files/:id', async (req, res, next) => {
    const file = await files.findOne({ _id: String(req.params.id), ready: true });
    if (!file || !directory) fail(404, 'File not found.');
    await visiblePost(file.postId, res.locals.user);
    const inline = req.query.preview === '1' && file.preview;
    res.setHeader('Content-Type', inline || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.sendFile(join(directory, file._id), { cacheControl: false }, error => { if (error) next(error); });
  });
  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.aborted) return;
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) { res.status(error.status).json({ error: error.message }); return; }
    console.error('Community request failed:', error instanceof Error ? error.name : 'Unknown error');
    res.status(503).json({ error: 'The request could not be completed. Please try again.' });
  });
  return router;
}
