import { useCallback, useEffect, useRef, useState } from 'react';

type User = { id: string; username: string; moderator: boolean };
type Session = { user: User | null; uploadsEnabled: boolean; storageLimit: number; storageUsed: number };
type Group = { _id: string; name: string; ownerId: string; members: string[] };
type Attachment = { _id: string; name: string; size: number; preview: string | null };
type Post = { _id: string; authorId: string; author: string; text: string; created: string; groupId: string | null; files: Attachment[]; canDelete: boolean };
type Entry = { _id: string; authorId: string; author: string; text: string; created: string };
const base = '/api/community';

async function api<T = { ok: boolean }>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Oathkeeper-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error('Cannot reach Oathkeeper. Check that the local server is running.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('The server is unavailable. Please try again.'); }
  if (!response.ok) throw new Error(data.error ?? 'The request failed. Please try again.');
  return data as T;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value: string) => new Date(value).toLocaleString();

function AttachmentView({ file }: { file: Attachment }) {
  const url = `${base}/files/${file._id}`;
  return <div className="attachment">
    {file.preview?.startsWith('image/') && <img src={`${url}?preview=1`} alt={file.name} loading="lazy" />}
    {file.preview?.startsWith('video/') && <video src={`${url}?preview=1`} controls preload="metadata" aria-label={file.name} />}
    <a href={url} download={file.name}>{file.name}</a><span className="hint">{(file.size / 1_000_000).toFixed(2)} MB</span>
  </div>;
}

export function Community() {
  const [session, setSession] = useState<Session | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [invitations, setInvitations] = useState<{ _id: string; name: string }[]>([]);
  const [scope, setScope] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [groupName, setGroupName] = useState('');
  const refresh = useCallback(async () => {
    const current = await api<Session>('/session');
    setSession(current);
    if (current.user) {
      const result = await api<{ groups: Group[]; invitations: { _id: string; name: string }[] }>('/groups');
      setGroups(result.groups); setInvitations(result.invitations);
      setScope(value => value && !result.groups.some(group => group._id === value) ? '' : value);
    } else { setGroups([]); setInvitations([]); setScope(''); }
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => { try { await refresh(); if (active) setError(''); } catch (error) { if (active) { setError(errorText(error)); } } };
    void load(); const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  const group = groups.find(value => value._id === scope);
  return <>
    <div className="intro"><p className="eyebrow">BEYOND THE CHARACTER SHEET</p><h1>A place for your party.</h1><p>Share adventures, trade maps, and keep the conversation going.</p></div>
    <p className="notice">Public posts are visible to everyone. Private group posts, files, and messages are visible only to group members. Character worksheets still need to be downloaded separately.</p>
    {error && <p role="alert" className="notice">{error}</p>}
    {!session && !error && <p role="status">Connecting to the community…</p>}
    {session && <>
      <section className="panel" aria-label="Your account">
        {session.user ? <div className="workspace-heading"><p>Signed in as <strong>{session.user.username}</strong></p><button disabled={busy} onClick={() => void action(async () => { await api('/logout', 'POST'); setScope(''); })}>Sign out</button></div> : <>
          <h2>{register ? 'Create an account' : 'Welcome back'}</h2><p>Sign in to post, join groups, and send messages. You can read public posts without an account.</p>
          <form className="account-form" onSubmit={event => { event.preventDefault(); void action(async () => { await api(register ? '/register' : '/login', 'POST', { username, password }); setPassword(''); }); }}>
            <label>Username<input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
            <label>Password (12–128 characters)<input type="password" required minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} /></label>
            <button className="primary" disabled={busy}>{register ? 'Create account' : 'Sign in'}</button>
            <button type="button" disabled={busy} onClick={() => setRegister(value => !value)}>{register ? 'I already have an account' : 'Create an account'}</button>
          </form><p className="hint">Keep your password safe. Password recovery is not available in this first version.</p>
        </>}
      </section>
      <div className="community-controls panel">
        <label>Where would you like to share?<select value={scope} onChange={event => setScope(event.target.value)}><option value="">Public community</option>{groups.map(group => <option key={group._id} value={group._id}>{group.name} · Private</option>)}</select></label>
        {session.user && <>
          <form className="inline-form" onSubmit={event => { event.preventDefault(); void action(async () => { const group = await api<Group>('/groups', 'POST', { name: groupName }); setGroupName(''); setScope(group._id); }); }}><label>New private group<input required maxLength={80} value={groupName} onChange={event => setGroupName(event.target.value)} /></label><button disabled={busy || !groupName.trim()}>Create group</button></form>
          {invitations.map(invitation => <div className="actions" key={invitation._id}><p>Invitation to <strong>{invitation.name}</strong></p><button disabled={busy} onClick={() => void action(async () => { await api(`/groups/${invitation._id}/join`, 'POST'); setScope(invitation._id); })}>Join group</button></div>)}
        </>}
      </div>
      {group && session.user && <GroupMembers key={group._id} group={group} user={session.user} />}
      <CommunitySpace key={`${session.user?.id ?? 'guest'}:${scope}`} session={session} group={group} onStorageChange={() => void refresh().catch(error => setError(errorText(error)))} />
      {session.user?.moderator && <ReportQueue />}
    </>}
  </>;
}

function GroupMembers({ group, user }: { group: Group; user: User }) {
  const [members, setMembers] = useState<{ _id: string; username: string }[]>([]);
  const [invite, setInvite] = useState(''); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => setMembers(await api(`/groups/${group._id}/members`)), [group._id]);
  useEffect(() => { void refresh().catch(error => { setMembers([]); setStatus(errorText(error)); }); }, [refresh, group.members.join(',')]);
  return <section className="panel"><h2>{group.name}</h2><p className="hint">Private · All members can post and chat. Only the owner can invite or remove members.</p>
    <ul className="member-list">{members.map(member => <li key={member._id}>{member.username}{member._id === group.ownerId ? ' · Owner' : ''}{user.id === group.ownerId && member._id !== user.id && <button disabled={busy} onClick={async () => { setBusy(true); try { await api(`/groups/${group._id}/members/${member._id}`, 'DELETE'); await refresh(); setStatus('Member removed. They can no longer access this group.'); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); } }}>Remove member</button>}</li>)}</ul>
    {user.id === group.ownerId && <form className="inline-form" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await api(`/groups/${group._id}/invitations`, 'POST', { username: invite }); setInvite(''); setStatus('Invitation sent. They can accept it in their Community tab.'); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); } }}><label>Invite by username<input required value={invite} maxLength={30} onChange={event => setInvite(event.target.value)} /></label><button disabled={busy || !invite.trim()}>Send invitation</button></form>}
    <p role="status">{status}</p>
  </section>;
}

function CommunitySpace({ session, group, onStorageChange }: { session: Session; group?: Group; onStorageChange: () => void }) {
  const [posts, setPosts] = useState<Post[]>([]); const [error, setError] = useState('');
  const [text, setText] = useState(''); const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState('');
  const fileInput = useRef<HTMLInputElement>(null); const upload = useRef<XMLHttpRequest | null>(null);
  const mounted = useRef(true);
  const path = group ? `/posts?groupId=${group._id}` : '/posts';
  const refresh = useCallback(async () => { const result = await api<Post[]>(path); if (mounted.current) setPosts(result); }, [path]);
  useEffect(() => {
    mounted.current = true;
    let loading = false;
    const load = async () => { if (loading) return; loading = true; try { await refresh(); } catch (error) { if (mounted.current) { setPosts([]); setError(errorText(error)); } } finally { loading = false; } };
    void load(); const timer = window.setInterval(() => void load(), 5000);
    return () => { mounted.current = false; window.clearInterval(timer); upload.current?.abort(); };
  }, [refresh]);
  function uploadFile(postId: string, file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest(); upload.current = xhr;
      xhr.open('POST', `${base}/posts/${postId}/files`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-Oathkeeper-Request', '1');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name)); xhr.setRequestHeader('X-File-Type', file.type);
      xhr.upload.onprogress = event => setProgress(`Uploading ${file.name}: ${event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0}%`);
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else { try { reject(new Error(JSON.parse(xhr.responseText).error)); } catch { reject(new Error('Upload failed. Please try again.')); } } };
      xhr.onerror = () => reject(new Error('Connection lost during upload. Please try again.'));
      xhr.onabort = () => reject(new Error('Upload cancelled. Your post was not published.'));
      xhr.send(file);
    });
  }
  async function publish() {
    setBusy(true); setError(''); let draft: string | null = null;
    try {
      const result = await api<Post>('/posts', 'POST', { text, groupId: group?._id ?? null }); draft = result._id;
      for (const file of files) { if (!mounted.current) throw new Error('Upload cancelled.'); await uploadFile(draft, file); }
      if (!mounted.current) throw new Error('Post cancelled.');
      await api(`/posts/${draft}/publish`, 'POST'); draft = null;
      setText(''); setFiles([]); if (fileInput.current) fileInput.current.value = '';
      setProgress('Post published.'); await refresh(); onStorageChange();
    } catch (error) {
      if (draft) { try { await api(`/posts/${draft}`, 'DELETE'); } catch { /* Server startup cleanup recovers abandoned drafts. */ } }
      if (mounted.current) { setError(errorText(error)); setProgress(''); onStorageChange(); }
    } finally { upload.current = null; if (mounted.current) setBusy(false); }
  }
  return <div className="community-workspace"><section aria-label="Posts">
    {session.user && <div className="panel"><p className="eyebrow">{group ? 'PRIVATE GROUP' : 'PUBLIC COMMUNITY'}</p><h2>Share an adventure</h2>
      <form onSubmit={event => { event.preventDefault(); void publish(); }}>
        <label>Post text<textarea rows={4} maxLength={10000} disabled={busy} value={text} onChange={event => setText(event.target.value)} placeholder="A memorable moment, a map, or a recap…" /></label>
        <label className="file-picker">Attach photos, videos, or files<input ref={fileInput} type="file" multiple disabled={busy || !session.uploadsEnabled} onChange={event => { const selected = Array.from(event.target.files ?? []); if (selected.length > 10) { setError('Choose up to 10 files per post.'); event.target.value = ''; setFiles([]); } else { setFiles(selected); setError(''); } }} /></label>
        <p className="hint">Per file: photos 100 MB · videos 500 MB · other files 1 GB. Up to 10 files per post. Files remain until the post is deleted.</p>
        <p className="hint">App storage: {(session.storageUsed / 1e9).toFixed(2)} / {(session.storageLimit / 1e9).toFixed(0)} GB. Uploads pause when full.</p>
        {!session.uploadsEnabled && <p className="notice">File storage is not connected on this server yet. Text posts and messages are available.</p>}
        <ul className="member-list">{files.map((file, index) => <li key={`${file.name}:${index}`}>{file.name} · {(file.size / 1e6).toFixed(2)} MB <button type="button" disabled={busy} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>Remove</button></li>)}</ul>
        <button className="primary" disabled={busy || (!text.trim() && !files.length)}>{busy ? 'Publishing…' : group ? 'Post to group' : 'Post publicly'}</button>
        {busy && <button type="button" onClick={() => upload.current?.abort()}>Cancel upload</button>}
      </form><p role="status">{progress}</p>
    </div>}
    {error && <p role="alert" className="notice">{error}</p>}
    <h2>{group ? `${group.name} posts` : 'Public posts'}</h2><p className="hint">Latest 50 posts · Refreshes automatically.</p>
    {!posts.length && <div className="panel"><p>No posts to show yet.</p></div>}
    {posts.map(post => <PostCard key={post._id} post={post} user={session.user} ownerId={group?.ownerId} onChange={async () => { await refresh(); onStorageChange(); }} />)}
  </section><section className="panel message-panel" aria-label="Group messages">{group && session.user ? <Chat group={group} user={session.user} /> : <><p className="eyebrow">AROUND THE TABLE</p><h2>Group messages</h2><p>Select a private group to talk with your party. Messages are saved and visible only to its members.</p></>}</section></div>;
}

function PostCard({ post, user, ownerId, onChange }: { post: Post; user: User | null; ownerId?: string; onChange: () => Promise<void> }) {
  const [comments, setComments] = useState<Entry[]>([]); const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState(''); const [report, setReport] = useState(false); const [reason, setReason] = useState('');
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => setComments(await api(`/posts/${post._id}/comments`)), [post._id]);
  useEffect(() => { if (!showComments) return; let active = true; const load = async () => { try { const entries = await api<Entry[]>(`/posts/${post._id}/comments`); if (active) setComments(entries); } catch (error) { if (active) { setComments([]); setStatus(errorText(error)); } } }; void load(); const timer = window.setInterval(() => void load(), 5000); return () => { active = false; window.clearInterval(timer); }; }, [showComments, post._id]);
  async function act(work: () => Promise<unknown>) { setBusy(true); setStatus(''); try { await work(); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); } }
  return <article className="panel"><p className="eyebrow">{post.author} · {date(post.created)}</p><p className="post-text">{post.text}</p><div className="attachment-grid">{post.files.map(file => <AttachmentView key={file._id} file={file} />)}</div>
    <div className="actions"><button onClick={() => setShowComments(value => !value)}>{showComments ? 'Hide comments' : 'Comments'}</button>
      {post.canDelete && <button disabled={busy} onClick={() => { if (window.confirm('Delete this post, its comments, and attached files?')) void act(async () => { await api(`/posts/${post._id}`, 'DELETE'); await onChange(); }); }}>Delete post</button>}
      {user && !post.groupId && <button disabled={busy} onClick={() => setReport(value => !value)}>Report</button>}
    </div>
    {report && <form onSubmit={event => { event.preventDefault(); void act(async () => { await api(`/posts/${post._id}/report`, 'POST', { reason }); setReason(''); setReport(false); setStatus('Report sent for review.'); }); }}><label>Why are you reporting this post or its comments?<textarea required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><button disabled={busy || !reason.trim()}>Submit report</button></form>}
    {showComments && <div className="comments"><h3>Latest comments</h3>{!comments.length && <p>No comments yet.</p>}{comments.map(entry => <div className="message-bubble" key={entry._id}><strong>{entry.author}</strong><p className="post-text">{entry.text}</p>{user && (entry.authorId === user.id || ownerId === user.id) && <button disabled={busy} onClick={() => void act(async () => { await api(`/posts/${post._id}/comments/${entry._id}`, 'DELETE'); await refresh(); })}>Delete comment</button>}</div>)}
      {user && <form onSubmit={event => { event.preventDefault(); void act(async () => { await api(`/posts/${post._id}/comments`, 'POST', { text: comment }); setComment(''); await refresh(); }); }}><label>Comment<textarea required maxLength={4000} value={comment} onChange={event => setComment(event.target.value)} /></label><button disabled={busy || !comment.trim()}>Add comment</button></form>}
    </div>}<p role="status">{status}</p>
  </article>;
}

function Chat({ group, user }: { group: Group; user: User }) {
  const [messages, setMessages] = useState<Entry[]>([]); const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => setMessages(await api(`/groups/${group._id}/messages`)), [group._id]);
  useEffect(() => { let active = true; let loading = false; const load = async () => { if (loading) return; loading = true; try { const entries = await api<Entry[]>(`/groups/${group._id}/messages`); if (active) { setMessages(entries); setError(''); } } catch (error) { if (active) { setMessages([]); setError(errorText(error)); } } finally { loading = false; } }; void load(); const timer = window.setInterval(() => void load(), 3000); return () => { active = false; window.clearInterval(timer); }; }, [group._id]);
  useEffect(() => { const element = log.current; if (element) element.scrollTop = element.scrollHeight; }, [messages.length]);
  return <><p className="eyebrow">AROUND THE TABLE</p><h2>Group messages</h2><p className="hint">Only members of {group.name} · Latest 100 messages · Updates every 3 seconds.</p>
    <div ref={log} className="message-log" role="log" aria-label="Group conversation">{!messages.length && <p>No messages yet. Start the conversation.</p>}{messages.map(entry => <div className="message-bubble" key={entry._id}><strong>{entry.author}</strong><p className="hint">{date(entry.created)}</p><p className="post-text">{entry.text}</p>{(entry.authorId === user.id || group.ownerId === user.id) && <button disabled={busy} onClick={async () => { setBusy(true); try { await api(`/groups/${group._id}/messages/${entry._id}`, 'DELETE'); await refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }}>Delete message</button>}</div>)}</div>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await api(`/groups/${group._id}/messages`, 'POST', { text }); setText(''); await refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }}><label>Message<textarea rows={3} required maxLength={4000} disabled={busy} value={text} onChange={event => setText(event.target.value)} /></label><button className="primary" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send message'}</button></form>
    {error && <p role="alert" className="notice">{error}</p>}
  </>;
}

function ReportQueue() {
  type Report = { _id: string; reason: string; postId: string; post: Post | null; comments: Entry[] };
  const [reports, setReports] = useState<Report[]>([]); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { try { setReports(await api('/reports')); } catch (error) { setReports([]); setStatus(errorText(error)); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <section className="panel"><h2>Public reports</h2><button disabled={busy} onClick={() => void refresh()}>Refresh reports</button>{!reports.length && <p>No open reports.</p>}{reports.map(report => <div className="report" key={report._id}><p className="post-text"><strong>Reason:</strong> {report.reason}</p><p className="post-text">{report.post?.text ?? 'Post no longer available.'}</p><div className="attachment-grid">{report.post?.files.map(file => <AttachmentView key={file._id} file={file} />)}</div><details><summary>Review comments</summary>{report.comments.map(comment => <p className="post-text" key={comment._id}><strong>{comment.author}:</strong> {comment.text}</p>)}</details><p className="hint">Post ID: {report.postId}</p>{[false, true].map(remove => <button key={String(remove)} disabled={busy} onClick={async () => { if (remove && !window.confirm('Remove the reported post, comments, and files?')) return; setBusy(true); try { await api(`/reports/${report._id}/resolve`, 'POST', { remove }); await refresh(); setStatus(remove ? 'Reported content removed.' : 'Report dismissed.'); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); } }}>{remove ? 'Remove reported post' : 'Dismiss report'}</button>)}</div>)}<p role="status">{status}</p></section>;
}
