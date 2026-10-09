/** Inlined into generated React pages; gateway cookies/policies remain authoritative. */
export const liveDataRuntime = `
const recordText = (record, field) => {
  const value = Object.hasOwn(record, field) ? record[field] : null;
  return value == null ? '—' : (typeof value === 'object' ? JSON.stringify(value) : String(value)).slice(0, 5000);
};
function LiveRecords({source, children}) {
  const [records, setRecords] = React.useState([]), [page, setPage] = React.useState(1), [revision, setRevision] = React.useState(0);
  const [busy, setBusy] = React.useState(true), [error, setError] = React.useState(''), [status, setStatus] = React.useState(0);
  const sequence = React.useRef(0), active = React.useRef(null);
  React.useEffect(() => {
    const controller = new AbortController(), current = ++sequence.current;
    active.current = controller; setBusy(true); setRecords([]); setError(''); setStatus(0);
    apiFetch(source.route + (source.paginated ? '?page=' + page : ''), {cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])}, source.port).then(rows => {
      if (!Array.isArray(rows) || rows.length > source.size || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || typeof row._id !== 'string') || new Set(rows.map(row => row._id)).size !== rows.length) throw new Error('Invalid record list');
      if (sequence.current === current && !controller.signal.aborted) setRecords(rows);
    }).catch(e => {
      if (sequence.current === current && !controller.signal.aborted) {setStatus(e.status || 0); setError(e.status === 401 ? 'Sign in to view these records.' : e.status === 403 ? 'This account cannot view these records.' : 'Records could not be loaded. Please retry.');}
    }).finally(() => {if (sequence.current === current && !controller.signal.aborted) setBusy(false);});
    return () => controller.abort();
  }, [source.port, source.route, source.size, source.paginated, page, revision]);
  React.useEffect(() => {
    const refresh = () => {if (document.visibilityState === 'visible') {setRecords([]); setRevision(v => v + 1);}};
    const hide = () => {++sequence.current; active.current?.abort(); setRecords([]); setBusy(true);};
    const visibility = () => document.visibilityState === 'visible' ? refresh() : hide();
    window.addEventListener('focus', refresh); window.addEventListener('blur', hide); window.addEventListener('pageshow', refresh); window.addEventListener('pagehide', hide); window.addEventListener('levoks:records:refresh', refresh); document.addEventListener('visibilitychange', visibility);
    return () => {window.removeEventListener('focus', refresh); window.removeEventListener('blur', hide); window.removeEventListener('pageshow', refresh); window.removeEventListener('pagehide', hide); window.removeEventListener('levoks:records:refresh', refresh); document.removeEventListener('visibilitychange', visibility);};
  }, []);
  return <section className="live-records" aria-label={source.label} aria-busy={busy}>
    <button type="button" disabled={busy} onClick={() => setRevision(v => v + 1)}>Refresh records</button>
    {busy ? <p role="status">Loading records…</p> : error ? <div><p role="alert">{error}</p>{[401,403].includes(status) && source.account && <a href={source.account}>Manage account</a>}<button type="button" onClick={() => setRevision(v => v + 1)}>Retry loading records</button></div> : records.length ? children(records) : <p role="status">{source.emptyMessage || 'No records on this page.'}</p>}
    {source.paginated && <nav aria-label={source.label + ' pages'}><button type="button" disabled={busy || page === 1} onClick={() => setPage(v => v - 1)}>Previous page</button><span>Page {page}</span><button type="button" disabled={busy || !!error || records.length < source.size || page >= 10000} onClick={() => setPage(v => v + 1)}>Next page</button></nav>}
  </section>;
}
`;

export const liveDataCSS = `.live-records{max-width:100%;min-width:0;overflow-wrap:anywhere}.live-records>button,.live-records nav{margin:8px 0}.live-records nav{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.live-records button{font:inherit;padding:8px 12px;cursor:pointer}.live-records button:disabled{cursor:default;opacity:.55}.live-records [role=alert]{color:#992f25}.live-records-table{max-width:100%;overflow:auto}.live-records table{width:100%;border-collapse:collapse;text-align:left}.live-records th,.live-records td{padding:12px;border:1px solid #d1d5db;min-width:120px;max-width:380px;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}.live-records caption{text-align:left;padding:12px;font-weight:600}.live-records-items{display:flex;flex-direction:column;gap:12px}.live-records-items>article{min-width:0;max-width:100%}.live-records-items>article>*{position:relative!important;left:auto!important;top:auto!important;max-width:100%}.live-records :focus-visible{outline:2px solid currentColor;outline-offset:3px}`;
