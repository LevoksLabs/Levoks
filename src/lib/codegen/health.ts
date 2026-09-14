import { healthSchema, type HealthConfig } from "@/lib/backend/health-schema";
import type { ServiceContainer } from "@/types/backend";

export function healthRuntime(
  service: ServiceContainer,
  services: ServiceContainer[],
) {
  const block = service.blocks.find((b) => b.type === "health_check");
  const config = healthSchema.parse(block?.config || {});
  const dependencies = config.serviceIds.flatMap((id) => {
    const target = services.find((s) => s.id === id);
    return target ? [{ id, port: target.port }] : [];
  });
  return `
const mongoose = require('mongoose');
const config = ${JSON.stringify(config)};
const dependencies = ${JSON.stringify(dependencies)};
let draining = false, cached, cachedAt = 0, flight;
exports.drain = () => {draining = true; cached = undefined;};
async function bounded(action) {
  let timer;
  try {return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Probe deadline')), config.timeoutMs);})]);}
  finally {clearTimeout(timer);}
}
async function probe() {
  const checks = {};
  await Promise.all([
    ...(config.checkDatabase ? [(async () => {
      try {if (mongoose.connection.readyState !== 1) throw new Error(); await bounded(() => mongoose.connection.db.admin().command({ping: 1, maxTimeMS: config.timeoutMs})); checks.database = 'up';}
      catch {checks.database = 'down';}
    })()] : []),
    ...dependencies.map(async dependency => {
      try {
        const base = new URL(process.env['HEALTH_ORIGIN_' + dependency.port] || 'http://localhost:' + dependency.port);
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error();
        const response = await fetch(new URL('/health/live', base), {redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs), headers: {Accept: 'application/json'}});
        await response.body?.cancel();
        checks[dependency.id] = response.ok ? 'up' : 'down';
      } catch {checks[dependency.id] = 'down';}
    }),
  ]);
  return {status: !draining && Object.values(checks).every(v => v === 'up') ? 'ready' : 'unavailable', checks};
}
async function readiness(req, res) {
  res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff');
  if (draining) return res.status(503).json({status: 'draining'});
  if (!cached || Date.now() - cachedAt >= config.cacheMs) {
    if (!flight) flight = probe().then(value => {cached = value; cachedAt = Date.now(); return value;}).finally(() => {flight = undefined;});
    try {await flight;} catch {return res.status(503).json({status: 'unavailable'});}
  }
  return res.status(draining || cached.status !== 'ready' ? 503 : 200).json(draining ? {status: 'draining'} : cached);
}
exports.mount = app => {
  app.get('/health/live', (req, res) => res.set('Cache-Control', 'no-store').json({status: 'alive'}));
  app.get(config.route, readiness);
  if (config.route !== '/health') app.get('/health', readiness);
};
`.trim();
}

export function healthConfiguration(service: ServiceContainer): HealthConfig {
  return healthSchema.parse(
    service.blocks.find((b) => b.type === "health_check")?.config || {},
  );
}
