import { useCallback, useEffect, useState } from 'react';
import { api, SafetyReportButton } from './community';
type Person = { _id: string; username: string; accepted?: boolean; incoming?: boolean };
type Message = { _id: string; authorId: string; author: string; text: string; created: string };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Please try again.';

export function Friends({ userId }: { userId: string }) {
  const [friends, setFriends] = useState<Person[]>([]), [blocks, setBlocks] = useState<Person[]>([]);
  const [query, setQuery] = useState(''), [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [f, b] = await Promise.all([api<Person[]>('/friends'), api<Person[]>('/blocks')]);
    setFriends(f); setBlocks(b);
    setSelected(current => current && f.some(p => p._id === current._id && p.accepted) ? current : null);
  }, []);
  useEffect(() => { let active = true; const load = () => refresh().catch(e => { if (active) setStatus(errorText(e)); }); void load(); const timer = setInterval(() => void load(), 5000); return () => { active = false; clearInterval(timer); }; }, [refresh]);
  async function act(work: () => Promise<unknown>) { setBusy(true); setStatus(''); try { await work(); await refresh(); } catch(e) { setStatus(errorText(e)); } finally { setBusy(false); } }
  const controls = (p: Person) => <><SafetyReportButton kind="user" targetId={p._id} /><button disabled={busy} onClick={() => { if (confirm(`Block ${p.username}? This removes your friendship, stops direct contact, and hides each other's content while signed in. Shared group membership stays unchanged.`)) void act(async () => { await api(`/blocks/${p._id}`, 'POST'); setPeople(current => current.filter(x => x._id !== p._id)); }); }}>Block</button></>;
  return <section className="panel"><p className="eyebrow">YOUR ADVENTURING CIRCLE</p><h2>Friends & direct messages</h2><p>Find a username, send a friend request, and start a private conversation after they accept.</p>
    <form className="inline-form" onSubmit={e => { e.preventDefault(); void act(async () => setPeople(await api<Person[]>(`/people?q=${encodeURIComponent(query)}`))); }}><label>Find people<input minLength={3} maxLength={30} required value={query} onChange={e => setQuery(e.target.value)} placeholder="At least 3 characters" /></label><button disabled={busy}>Search</button></form>
    <ul className="member-list">{people.map(p => <li key={p._id}><strong>{p.username}</strong>{!friends.some(f => f._id === p._id) && <button disabled={busy} onClick={() => void act(() => api(`/friends/${p._id}`, 'POST'))}>Add friend</button>}{controls(p)}</li>)}</ul>
    <h3>Your friends and requests</h3>{!friends.length && <p>No friends or requests yet.</p>}
    <ul className="member-list">{friends.map(p => <li key={p._id}><strong>{p.username}</strong><span>{p.accepted ? 'Friend' : p.incoming ? 'Wants to be friends' : 'Request sent'}</span>{p.accepted ? <button onClick={() => setSelected(p)}>Message</button> : p.incoming && <button disabled={busy} onClick={() => void act(() => api(`/friends/${p._id}/accept`, 'POST'))}>Accept</button>}<button disabled={busy} onClick={() => void act(() => api(`/friends/${p._id}`, 'DELETE'))}>{p.accepted ? 'Remove friend' : p.incoming ? 'Decline' : 'Cancel request'}</button>{controls(p)}</li>)}</ul>
    <details><summary>Blocked users ({blocks.length})</summary><p>Unblocking does not restore a friendship. Public content can still be viewed while signed out.</p>{blocks.map(p => <div className="actions" key={p._id}>{p.username}<button disabled={busy} onClick={() => void act(() => api(`/blocks/${p._id}`, 'DELETE'))}>Unblock</button></div>)}</details>
    <p role="status">{status}</p>{selected && <DirectChat key={selected._id} person={selected} userId={userId} onClose={() => setSelected(null)} />}
  </section>;
}
function DirectChat({ person, userId, onClose }: { person: Person; userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const path = `/direct/${person._id}`;
  const refresh = useCallback(async () => setMessages(await api<Message[]>(path)), [path]);
  useEffect(() => { let active = true; const load = async () => { try { const entries = await api<Message[]>(path); if (active) { setMessages(entries); setStatus(''); } } catch(e) { if (active) { setMessages([]); setStatus(errorText(e)); } } }; void load(); const timer = setInterval(() => void load(), 3000); return () => { active = false; clearInterval(timer); }; }, [path]);
  return <section aria-label={`Conversation with ${person.username}`}><div className="workspace-heading"><h3>Conversation with {person.username}</h3><button onClick={onClose}>Close</button></div><p className="hint">Private between you two. A reported message and your reason are shared with the moderator. Latest 100 messages; refreshes every 3 seconds.</p>
    <div className="message-log" role="log">{messages.map(m => <div className="message-bubble" key={m._id}><strong>{m.author}</strong><p className="hint">{new Date(m.created).toLocaleString()}</p><p className="post-text">{m.text}</p>{m.authorId !== userId ? <SafetyReportButton kind="direct" targetId={m._id} /> : <button disabled={busy} onClick={async () => { setBusy(true); try { await api(`${path}/${m._id}`, 'DELETE'); await refresh(); } catch(e) { setStatus(errorText(e)); } finally { setBusy(false); } }}>Delete message</button>}</div>)}</div>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api(path, 'POST', { text }); setText(''); await refresh(); } catch(e) { setStatus(errorText(e)); } finally { setBusy(false); } }}><label>Direct message<textarea required maxLength={4000} disabled={busy} value={text} onChange={e => setText(e.target.value)} /></label><button disabled={busy || !text.trim()}>Send message</button></form><p role="status">{status}</p>
  </section>;
}

export function SafetyQueue() {
  type Report = { _id: string; kind: string; reason: string; evidence: string };
  const [reports, setReports] = useState<Report[]>([]), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => setReports(await api<Report[]>('/safety-reports')), []);
  useEffect(() => { void refresh().catch(e => setStatus(errorText(e))); }, [refresh]);
  return <section className="panel"><h2>User & message reports</h2><button onClick={() => void refresh().catch(e => setStatus(errorText(e)))}>Refresh</button>{!reports.length && <p>No open reports.</p>}{reports.map(r => <article className="report" key={r._id}><p>{r.kind} report</p><p className="post-text"><strong>Reason:</strong> {r.reason}</p><p className="post-text"><strong>Reported content:</strong> {r.evidence}</p>{[false, true].filter(remove => !remove || r.kind !== 'user').map(remove => <button key={String(remove)} disabled={busy} onClick={async () => { setBusy(true); try { await api(`/safety-reports/${r._id}/resolve`, 'POST', { remove }); await refresh(); } catch(e) { setStatus(errorText(e)); } finally { setBusy(false); } }}>{remove ? 'Remove message' : 'Dismiss report'}</button>)}{r.kind === 'user' && <p className="hint">Account suspension is not implemented yet. Users can block this account.</p>}</article>)}<p role="status">{status}</p></section>;
}
