import type {
  BackendBlock,
  DbModelConfig,
  EndpointConfig,
  ServiceContainer,
} from "@/types/backend";
import { serviceSlug } from "@/lib/project/schema";

export function submissionInboxSource(
  service: ServiceContainer,
  endpoint: BackendBlock,
  identity: ServiceContainer,
) {
  const config = endpoint.config as EndpointConfig;
  const model = service.blocks.find(
    (b) => b.id === config.modelId && b.type === "db_model",
  );
  if (!model || model.type !== "db_model")
    throw new Error("Inbox model is missing.");
  const logout = identity.blocks.find(
    (b) =>
      b.type === "rest_endpoint" &&
      "route" in b.config &&
      b.config.route.endsWith("/logout"),
  );
  const modelConfig = model.config as DbModelConfig;
  const settings = JSON.stringify({
    title: service.name,
    fields: modelConfig.fields.map((f) => f.name),
    timestamps: modelConfig.timestamps,
    route: config.route,
    port: service.port,
    account: `/__levoks/account/${serviceSlug(identity.name)}`,
    logout: logout ? (logout.config as EndpointConfig).route : "",
    identityPort: identity.port,
  }).replaceAll("<", "\\u003c");
  return `"use client";
import {useEffect, useRef, useState} from 'react';
import {apiFetch} from '@/lib/api';
import './inbox.css';
const settings = ${settings};
const text = value => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export default function SubmissionInbox() {
  // ponytail: fixed 50-record pages omit total counts; a full final page may offer one empty Next page.
  const [records, setRecords] = useState([]), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [status, setStatus] = useState(0), [signingOut, setSigningOut] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), current = ++sequence.current;
    setBusy(true); setRecords([]); setError(''); setStatus(0);
    apiFetch(settings.route + '?page=' + page, {signal: controller.signal}, settings.port).then(rows => {
      if (!Array.isArray(rows) || rows.length > 50 || rows.some(row => !row || typeof row !== 'object' || !row._id)) throw new Error('The inbox returned an invalid record list.');
      if (sequence.current === current && !controller.signal.aborted) setRecords(rows);
    }).catch(e => {if (sequence.current === current && !controller.signal.aborted) {setStatus(e.status || 0); setError(e.status === 401 ? 'Sign in to view submissions.' : e.status === 403 ? 'This account does not have operator access.' : 'Submissions could not be loaded. Please retry.');}}).finally(() => {if (sequence.current === current && !controller.signal.aborted) setBusy(false);});
    return () => controller.abort();
  }, [page, revision]);
  useEffect(() => {
    const refresh = () => {if (document.visibilityState === 'visible') {setRecords([]); setRevision(v => v + 1);}};
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => {window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);};
  }, []);
  async function signOut() {
    ++sequence.current; setRecords([]); setBusy(false); setSigningOut(true); setStatus(401); setError('Signing out…');
    try {await apiFetch(settings.logout, {method: 'POST'}, settings.identityPort); setError('Signed out. Sign in to view submissions.');}
    catch {setError('Sign out could not be confirmed. Retry sign out before leaving a shared device.');}
    finally {setSigningOut(false);}
  }
  return <main className="submission-inbox"><a href="/">← Back to application</a><header><div><p>{settings.title}</p><h1>Submission inbox</h1></div><nav aria-label="Inbox actions"><a href={settings.account}>Manage account</a><button disabled={busy || signingOut} onClick={() => setRevision(v => v + 1)}>Refresh submissions</button>{settings.logout && <button disabled={signingOut} onClick={signOut}>Sign out</button>}</nav></header>
    {busy ? <p role="status">Loading submissions…</p> : error ? <section><p role="alert">{error}</p>{[401, 403].includes(status) && <a href={settings.account}>Sign in or set up operator</a>}<button onClick={() => setRevision(v => v + 1)}>Retry loading</button></section> : records.length === 0 ? <p role="status">No submissions on this page.</p> : <div className="inbox-table" role="region" aria-label="Submission records" tabIndex={0}><table><caption>Latest submissions · page {page}</caption><thead><tr>{settings.timestamps && <th scope="col">Submitted</th>}{settings.fields.map(field => <th key={field} scope="col">{field}</th>)}</tr></thead><tbody>{records.map(record => <tr key={record._id}>{settings.timestamps && <td>{record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</td>}{settings.fields.map(field => <td key={field}>{text(record[field])}</td>)}</tr>)}</tbody></table></div>}
    <nav className="inbox-pages" aria-label="Submission pages"><button disabled={busy || signingOut || page === 1} onClick={() => setPage(v => v - 1)}>Previous page</button><span>Page {page}</span><button disabled={busy || signingOut || !!error || records.length < 50 || page >= 10000} onClick={() => setPage(v => v + 1)}>Next page</button></nav>
  </main>;
}
`;
}

export const INBOX_CSS = `
.submission-inbox{min-height:100vh;box-sizing:border-box;padding:32px clamp(12px,4vw,64px);background:#f3f5fb;color:#17223b;font:16px/1.5 system-ui,sans-serif}.submission-inbox *{box-sizing:border-box}.submission-inbox a{color:#254eab}.submission-inbox header{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin:28px 0}.submission-inbox h1{margin:0;font-size:32px}.submission-inbox header p{margin:0;color:#52617e;overflow-wrap:anywhere}.submission-inbox nav{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.submission-inbox button{border:1px solid #b7c3d9;border-radius:8px;background:#fff;color:#254eab;padding:10px 14px;font:inherit;cursor:pointer}.submission-inbox button:disabled{opacity:.55;cursor:default}.submission-inbox :focus-visible{outline:3px solid #83adff;outline-offset:3px}.submission-inbox [role=alert]{padding:16px;background:#fff0ef;color:#992f25;border-radius:8px}.inbox-table{max-width:100%;overflow:auto;border:1px solid #dce2ef;border-radius:12px;background:white}.inbox-table table{border-collapse:collapse;width:100%;text-align:left}.inbox-table caption{padding:16px;text-align:left;font-weight:600}.inbox-table th,.inbox-table td{padding:14px 18px;border-top:1px solid #e5eaf2;min-width:140px;max-width:380px;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}.inbox-table th{background:#f8faff}.inbox-pages{margin:24px 0}@media(max-width:600px){.submission-inbox{padding-top:20px}.submission-inbox h1{font-size:26px}.submission-inbox header{gap:16px}.submission-inbox nav{gap:8px}.submission-inbox button{padding:9px 10px}}
`;
