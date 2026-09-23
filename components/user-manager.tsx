'use client'
import { useEffect, useState } from 'react'

type User = { id: string; login_id: string; full_name: string; created_at?: string }
export function UserManager() {
  const [users, setUsers] = useState<User[]>([]); const [loginId, setLoginId] = useState(''); const [fullName, setFullName] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  async function load() { const response = await fetch('/api/warehouse-users'); const data = await response.json(); setUsers(data.users ?? []) }
  useEffect(() => { void load() }, [])
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setMessage(''); const response = await fetch('/api/warehouse-users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, fullName, password }) }); const data = await response.json(); setBusy(false); if (!response.ok) { setMessage(data.error); return } setLoginId(''); setFullName(''); setPassword(''); setMessage('Warehouse user created.'); void load() }
  return <section className="user-manager"><div><p className="eyebrow">WAREHOUSE ACCESS</p><h1>Warehouse users</h1><p className="auth-copy">Create the user ID and password used by warehouse PICs to open the RF scanner.</p></div><form onSubmit={submit} className="user-form"><label>User ID<input required value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="pic.jakarta" /></label><label>Full name<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Warehouse PIC" /></label><label>Password<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>{message && <p className="auth-message">{message}</p>}</form><div className="user-list"><h2>Existing users</h2>{users.map(user => <div className="user-row" key={user.id}><strong>{user.login_id}</strong><span>{user.full_name}</span></div>)}</div></section>
}
