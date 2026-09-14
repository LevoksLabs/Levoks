import type {
  ServiceContainer,
  AuthConfig,
  EndpointConfig,
} from "@/types/backend";

export function gatewaySource(services: ServiceContainer[]) {
  const cookieNames = Object.fromEntries(
    services.map((s) => {
      const auth = s.blocks.find((b) => b.type === "auth_block")?.config as
        AuthConfig | undefined;
      const identity = auth?.identityServiceId
        ? services.find((v) => v.id === auth.identityServiceId)
        : s;
      return [
        s.port,
        auth && identity
          ? [
              `levoks_session_${identity.port}`,
              `levoks_refresh_${identity.port}`,
            ]
          : [],
      ];
    }),
  );
  const endpoints = Object.fromEntries(
    services.map((s) => [
      s.port,
      s.blocks
        .filter((b) => b.type === "rest_endpoint")
        .map((b) => ({
          route: (b.config as EndpointConfig).route,
          method: (b.config as EndpointConfig).method,
        })),
    ]),
  );
  return `
export const runtime = 'nodejs';
const endpoints = ${JSON.stringify(endpoints)};
const cookieNames = ${JSON.stringify(cookieNames)};
const origins = {${services.map((s) => `${s.port}: process.env.API_ORIGIN_${s.port} || process.env.NEXT_PUBLIC_API_${s.port} || 'http://localhost:${s.port}'`).join(",")}};
async function proxy(request, context) {
  const {service, path: segments} = await context.params;
  if (!Object.hasOwn(endpoints, service) || !Array.isArray(segments) || segments.some(s => !s || s === '.' || s === '..' || /[\\\\/\\x00]/.test(s))) return Response.json({error: 'Unknown API route'}, {status: 404});
  const method = request.method;
  const matched = endpoints[service].some(e => (e.method === method || method === 'HEAD' && e.method === 'GET') && e.route.split('/').filter(Boolean).length === segments.length && e.route.split('/').filter(Boolean).every((s, i) => s.startsWith(':') || s === segments[i]));
  if (!matched) return Response.json({error: 'Unknown API route'}, {status: 404});
  const here = new URL(request.url);
  try {
    // Next may normalize request.url to localhost. Host is the browser's origin
    // authority; production reverse proxies can pin the public origin explicitly.
    const publicOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(here.protocol + '//' + (request.headers.get('host') || here.host)).origin;
    if (!['GET', 'HEAD'].includes(method) && request.headers.get('origin') !== publicOrigin) return Response.json({error: 'Same-origin request required'}, {status: 403});
    const base = new URL(origins[service]);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) return Response.json({error: 'API origin is not configured correctly'}, {status: 503});
    const url = new URL('/' + segments.map(encodeURIComponent).join('/'), base); url.search = here.search;
    const headers = new Headers();
    for (const key of ['authorization', 'content-type', 'accept', 'user-agent']) {const value = request.headers.get(key); if (value) headers.set(key, value);}
    const cookies = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => cookieNames[service].includes(v.split('=')[0]));
    if (cookies.length) headers.set('cookie', cookies.join('; '));
    headers.set('origin', publicOrigin);
    let body;
    if (!['GET', 'HEAD'].includes(method) && request.body) {
      const reader = request.body.getReader(), chunks = []; let total = 0;
      try {while (true) {const {done, value} = await reader.read(); if (done) break; total += value.length; if (total > 1048576) {await reader.cancel(); return Response.json({error: 'Request exceeds 1 MB'}, {status: 413});} chunks.push(value);}} finally {reader.releaseLock();}
      body = Buffer.concat(chunks);
    }
    const response = await fetch(url, {method, headers, body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000)});
    const outgoing = new Headers({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'});
    for (const key of ['content-type', 'x-levoks-session', 'retry-after']) {const value = response.headers.get(key); if (value) outgoing.set(key, value);}
    for (const cookie of response.headers.getSetCookie()) if (cookieNames[service].includes(cookie.split('=')[0])) outgoing.append('set-cookie', cookie);
    return new Response(method === 'HEAD' || [204, 304].includes(response.status) ? null : response.body, {status: response.status, headers: outgoing});
  } catch {return Response.json({error: 'Application service is unavailable. Please retry.'}, {status: 502, headers: {'Cache-Control': 'no-store'}});}
}
export {proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE};
`.trim();
}

export function apiClientSource(services: ServiceContainer[]) {
  const refresh = Object.fromEntries(
    services.flatMap((s) => {
      const identityId = (
        s.blocks.find(
          (b) =>
            b.type === "auth_block" &&
            (b.config as AuthConfig).identityServiceId,
        )?.config as AuthConfig | undefined
      )?.identityServiceId;
      const identity = identityId
        ? services.find((v) => v.id === identityId)
        : s;
      const route = (
        identity?.blocks.find(
          (b) =>
            b.type === "rest_endpoint" &&
            (b.config as EndpointConfig).route.endsWith("/refresh"),
        )?.config as EndpointConfig | undefined
      )?.route;
      return route && identity
        ? [[s.port, `/__levoks/api/${identity.port}${route}`]]
        : [];
    }),
  );
  return `
const refreshRoutes = ${JSON.stringify(refresh)};
const flights = new Map();
async function refreshSession(route) {
  if (!flights.has(route)) flights.set(route, fetch(route, {method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(10000)}).then(r => r.ok).catch(() => false).finally(() => flights.delete(route)));
  return flights.get(route);
}
export async function apiFetch(path, options = {}, port) {
  if (!Number.isInteger(Number(port)) || !path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid application API route');
  const url = '/__levoks/api/' + port + path;
  const run = () => fetch(url, {...options, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(30000), headers: {'Content-Type': 'application/json', ...options.headers}});
  let response = await run();
  if (response.status === 401 && response.headers.get('x-levoks-session') === 'invalid' && refreshRoutes[port] && !/\\/(login|register|refresh|reset-password|verify-email)$/.test(path)) {
    await response.body?.cancel();
    const renew = async () => {
      // Another tab may already have refreshed before obtaining this same-origin lock.
      const probe = await run();
      if (probe.status !== 401 || probe.headers.get('x-levoks-session') !== 'invalid') return probe;
      if (await refreshSession(refreshRoutes[port])) {await probe.body?.cancel(); return run();}
      return probe;
    };
    response = typeof navigator !== 'undefined' && navigator.locks ? await navigator.locks.request('levoks-refresh:' + refreshRoutes[port], renew) : await renew();
  }
  if (!response.ok) {
    let detail; try {detail = await response.json();} catch {}
    const error = new Error(typeof detail?.error === 'string' ? detail.error : detail?.error?.message || 'Request failed (' + response.status + ')'); error.status = response.status; throw error;
  }
  return response.status === 204 ? null : response.json();
}
`.trim();
}
