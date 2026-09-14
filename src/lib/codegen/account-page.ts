import type { ServiceContainer, EndpointConfig } from "@/types/backend";
export function accountPageSource(service: ServiceContainer) {
  const routes = Object.fromEntries(
    service.blocks
      .filter((b) => b.type === "rest_endpoint")
      .map((b) => [
        (b.config as EndpointConfig).route.split("/").pop(),
        (b.config as EndpointConfig).route,
      ]),
  );
  return `"use client";
import {useEffect, useState} from 'react';
import {apiFetch} from '@/lib/api';
import './account.css';
const routes = ${JSON.stringify(routes)};
const call = (action, body, method = 'POST') => {
  if (!routes[action]) throw new Error('This account action is not configured in the backend.');
  return apiFetch(routes[action], {method, ...(method === 'GET' ? {} : {body: JSON.stringify(body || {})})}, ${service.port});
};
export default function AccountPage() {
  const [user, setUser] = useState(null), [sessions, setSessions] = useState([]), [mode, setMode] = useState('login');
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [password, setPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [token, setToken] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [ready, setReady] = useState(false);
  async function reload() {setUser(await call('profile', undefined, 'GET')); if (routes.sessions) setSessions(await call('sessions', undefined, 'GET'));}
  useEffect(() => {
    function consumeLink() {
      const values = new URLSearchParams(window.location.hash.slice(1));
      if (!values.has('token') || !['verify', 'reset'].includes(values.get('mode'))) return;
      setToken(values.get('token') || ''); setMode(values.get('mode')); setError(''); setMessage(''); setPassword(''); setNewPassword('');
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    consumeLink();
    window.addEventListener('hashchange', consumeLink);
    let alive = true;
    call('profile', undefined, 'GET').then(v => {if (alive) setUser(v);}).catch(e => {if (alive && e.status !== 401) setError(e.message);}).finally(() => {if (alive) setReady(true);});
    return () => {alive = false; window.removeEventListener('hashchange', consumeLink);};
  }, []);
  async function run(action) {if (busy) return; setBusy(true); setError(''); setMessage(''); try {await action();} catch(e) {setError(e.message || 'Account action failed');} finally {setBusy(false);}}
  function changeMode(value) {setMode(value); setPassword(''); setNewPassword(''); setMessage(''); setError('');}
  async function submit(event) {
    event.preventDefault();
    await run(async () => {
      if (mode === 'login') {await call('login', {email, password}); setPassword(''); await reload(); setMessage('Signed in.');}
      if (mode === 'register') {await call('register', {email, password, name}); setPassword(''); setMode('login'); setMessage('Account created. Verify your email if required, then sign in.');}
      if (mode === 'forgot') {const result = await call('forgot-password', {email}); setMessage(result.message);}
      if (mode === 'reset') {await call('reset-password', {token, newPassword}); setToken(''); setNewPassword(''); setUser(null); setSessions([]); setMode('login'); setMessage('Password reset. Sign in with your new password.');}
      if (mode === 'verify') {await call('verify-email', {token}); setToken(''); setMode('login'); setMessage('Email verified. You can sign in now.'); if (user) await reload();}
    });
  }
  return <main className="levoks-account"><a className="account-home" href="/">← Back to application</a><section className="account-card" aria-labelledby="account-title">
    <p className="account-eyebrow">${service.name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("{", "&#123;").replaceAll("}", "&#125;")}</p><h1 id="account-title">Your account</h1>
    {message && <p role="status" className="account-message">{message}</p>}{error && <p role="alert" className="account-error">{error}</p>}
    {!ready ? <p role="status">Checking your session…</p> : user && !['reset', 'verify'].includes(mode) ? <>
      <h2>Welcome, {user.name}</h2><p>{user.email} · {user.emailVerified ? 'Email verified' : 'Email not verified'}</p>
      {!user.emailVerified && routes['request-verification'] && <button disabled={busy} onClick={() => run(async () => {const result = await call('request-verification', {email: user.email}); setMessage(result.message);})}>Send verification email</button>}
      <button disabled={busy} onClick={() => run(async () => {await call('logout'); setUser(null); setSessions([]); setMode('login'); setMessage('Signed out.');})}>Sign out</button>
      {routes['change-password'] && <form onSubmit={e => {e.preventDefault(); void run(async () => {await call('change-password', {currentPassword: password, newPassword}); setPassword(''); setNewPassword(''); setUser(null); setSessions([]); setMode('login'); setMessage('Password changed. Sign in again.');});}}>
        <h2>Change password</h2><label>Current password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label><label>New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} required/></label><button disabled={busy}>Change password and sign out everywhere</button>
      </form>}
      {routes.sessions && <><h2>Active sessions</h2><button disabled={busy} onClick={() => run(reload)}>Refresh sessions</button><ul>{sessions.map(s => <li key={s.id}><span>{s.agent || 'Unknown device'}<small>Last used {new Date(s.lastUsedAt).toLocaleString()}</small></span><button disabled={busy} onClick={() => run(async () => {await call('revoke-session', {sessionId: s.id}); try {await reload();} catch {setUser(null); setSessions([]); setMode('login');}})}>Revoke session</button></li>)}</ul><button disabled={busy} onClick={() => run(async () => {await call('logout-all'); setUser(null); setSessions([]); setMode('login'); setMessage('All sessions signed out.');})}>Sign out all devices</button></>}
    </> : <>
      <nav aria-label="Account actions"><button type="button" aria-pressed={mode === 'login'} onClick={() => changeMode('login')}>Sign in</button><button type="button" aria-pressed={mode === 'register'} onClick={() => changeMode('register')}>Create account</button>{routes['forgot-password'] && <button type="button" aria-pressed={mode === 'forgot'} onClick={() => changeMode('forgot')}>Forgot password</button>}</nav>
      <form onSubmit={submit}>
        {['login', 'register', 'forgot'].includes(mode) && <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={320} required/></label>}
        {mode === 'register' && <label>Name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={200} required/></label>}
        {['login', 'register'].includes(mode) && <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} required/></label>}
        {['reset', 'verify'].includes(mode) && <><p>{mode === 'reset' ? 'Choose a new password. Every existing session will be signed out.' : 'Confirm this email verification request.'}</p><label>Confirmation token<input autoComplete="off" value={token} onChange={e => setToken(e.target.value)} required/></label></>}
        {mode === 'reset' && <label>New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} required/></label>}
        <button className="account-primary" disabled={busy}>{busy ? 'Working…' : {login: 'Sign in to account', register: 'Register account', forgot: 'Send recovery instructions', reset: 'Reset password', verify: 'Verify email'}[mode]}</button>
      </form>
      {mode === 'login' && routes['request-verification'] && <button disabled={busy || !email} onClick={() => run(async () => {const result = await call('request-verification', {email}); setMessage(result.message);})}>Resend verification email</button>}
    </>}
  </section></main>;
}
`;
}
export const ACCOUNT_CSS = `
.levoks-account{min-height:100vh;box-sizing:border-box;padding:32px 20px 64px;background:#f3f5fb;color:#17223b;font-family:system-ui,-apple-system,sans-serif;line-height:1.5}
.levoks-account *{box-sizing:border-box}.account-home{display:block;max-width:680px;margin:0 auto 20px;color:#254eab;text-decoration:none}.account-card{max-width:680px;margin:auto;padding:36px;background:#fff;border:1px solid #dce2ef;border-radius:18px;box-shadow:0 8px 32px #17223b0a}.account-card h1{font-size:30px;line-height:1.2;margin:8px 0 28px}.account-card h2{font-size:20px;margin:28px 0 12px}.account-eyebrow{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#52617e}.account-card nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}.account-card label{display:grid;gap:7px;margin:18px 0;font-weight:600}.account-card input{width:100%;padding:12px;border:1px solid #a9b7d0;border-radius:8px;font:inherit;background:#fff;color:#17223b}.account-card button{padding:10px 14px;border:1px solid #b7c3d9;background:#fff;color:#254eab;border-radius:8px;cursor:pointer;font:inherit;margin:4px 6px 4px 0}.account-card button[aria-pressed=true],.account-card .account-primary{background:#234daa;color:white;border-color:#234daa}.account-primary{width:100%;margin-top:12px!important}.account-card button:disabled{opacity:.55;cursor:wait}.account-card :focus-visible{outline:3px solid #83adff;outline-offset:3px}.account-message{background:#e8f8ef;padding:14px;border-radius:8px;color:#155b35}.account-error{background:#fff0ef;padding:14px;border-radius:8px;color:#992f25}.account-card ul{padding:0;list-style:none}.account-card li{display:flex;gap:16px;align-items:center;justify-content:space-between;border-bottom:1px solid #e5eaf2;padding:14px 0;overflow-wrap:anywhere}.account-card small{display:block;color:#66748b;margin-top:6px}.account-card li button{flex-shrink:0}@media(max-width:600px){.account-card{padding:24px 18px}.levoks-account{padding:20px 12px}.account-card li{align-items:flex-start;flex-direction:column}}
`;
