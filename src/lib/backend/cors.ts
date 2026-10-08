import type { MiddlewareConfig } from "@/types/backend";

export const CORS_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
export const corsList = (value: string) => value.split(",").map(v => v.trim()).filter(Boolean);

export function corsProblems(config: MiddlewareConfig) {
  const errors: string[] = [];
  const origins = corsList(config.corsOrigins ?? "http://localhost:3000");
  if (!origins.length || origins.some(value => {
    try { const url = new URL(value); return !["http:", "https:"].includes(url.protocol) || !!(url.username || url.password || url.search || url.hash) || url.pathname !== "/"; }
    catch { return true; }
  })) errors.push("CORS origins must be explicit HTTP(S) origins without paths, credentials or wildcards.");
  if (config.corsMethods && (!config.corsMethods.length || config.corsMethods.some(method => !CORS_METHODS.includes(method)))) errors.push("Select at least one supported CORS method.");
  if (config.corsMethods && new Set(config.corsMethods).size !== config.corsMethods.length) errors.push("CORS methods must be distinct.");
  for (const fields of [config.corsAllowedHeaders, config.corsExposedHeaders]) {
    if (fields?.some(name => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/i.test(name))) errors.push("CORS header names must use letters, numbers and single hyphens; wildcards are not supported.");
    if (fields && new Set(fields.map(name => name.toLowerCase())).size !== fields.length) errors.push("CORS header names must be distinct, ignoring letter case.");
  }
  if (config.corsExposedHeaders?.some(name => /^(set-cookie|set-cookie2)$/i.test(name))) errors.push("Browsers cannot expose Set-Cookie. Manage cookies through authentication.");
  return errors;
}

/** Uses the installed cors middleware; the small guard fails closed before routes. */
export function corsSource(config: MiddlewareConfig | undefined, endpointHeaders: string[]) {
  const methods = [...new Set(config?.corsMethods || CORS_METHODS)];
  const allowed = [...new Set((config?.corsAllowedHeaders || ["Content-Type", "Authorization", ...endpointHeaders]).map(name => name.toLowerCase()))];
  const options = {methods, allowedHeaders:allowed, exposedHeaders:config?.corsExposedHeaders || ["X-Levoks-Session", "Retry-After"], credentials:config?.corsCredentials ?? true, maxAge:config?.corsMaxAge ?? 600};
  return `const cors = require('cors');
const options = ${JSON.stringify(options)};
const values = (process.env.CORS_ORIGINS || ${JSON.stringify(config?.corsOrigins ?? "http://localhost:3000")}).split(',').map(value => value.trim()).filter(Boolean);
const origins = values.map(value => {
  let url; try { url = new URL(value); } catch { throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins without paths, credentials or wildcards');
  return url.origin;
});
if (!origins.length) throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins');
process.env.CORS_ORIGINS = origins.join(',');
const respond = cors({...options, origin:origins, optionsSuccessStatus:204});
module.exports = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origins.includes(origin)) return res.status(403).json({error:'Origin not allowed'});
  if (origin && req.method === 'OPTIONS') {
    const method = req.headers['access-control-request-method'];
    const headers = String(req.headers['access-control-request-headers'] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!options.methods.includes(method) || headers.some(name => !options.allowedHeaders.includes(name))) return res.status(403).json({error:'CORS method or headers not allowed'});
  } else if (origin && !options.methods.includes(req.method)) return res.status(403).json({error:'CORS method not allowed'});
  return respond(req, res, next);
};
`;
}
