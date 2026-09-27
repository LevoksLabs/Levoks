import type { MiddlewareConfig, ServiceContainer } from "@/types/backend";

export function rateLimitRuntime(
  service: ServiceContainer,
  services: ServiceContainer[],
) {
  const blocks = [
    service,
    ...services.filter((item) => item.id !== service.id),
  ].flatMap((owner) =>
    owner.blocks
      .filter(
        (block) =>
          block.type === "middleware" &&
          (block.config as MiddlewareConfig).middlewareType === "rateLimit" &&
          (owner.id === service.id ||
            (block.config as MiddlewareConfig).scope === "backend"),
      )
      .map((block) => ({ block, ownerId: owner.id })),
  );
  const configuration = blocks.map(({ block, ownerId }) => {
    if (block.type !== "middleware")
      throw new Error("Invalid rate limit block");
    const c = block.config as MiddlewareConfig;
    return {
      id: JSON.stringify([ownerId, block.id]),
      blockId: block.id,
      local: ownerId === service.id,
      scope: c.scope || "service",
      windowMs: Math.round((c.rateLimitWindow ?? 15) * 60000),
      limit: c.rateLimit ?? 100,
      storage: c.rateLimitStore || "memory",
      strategy: c.rateLimitKey || "ip",
      message: {
        error:
          c.rateLimitMessage || "Too many requests. Please try again later.",
      },
    };
  });
  return `const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const {createHash} = require('node:crypto');
const configuration = ${JSON.stringify(configuration)};
const serviceId = ${JSON.stringify(service.id)};
const unavailable = () => Object.assign(new Error('Rate limit storage unavailable'), {status: 503});
const collection = () => { if (mongoose.connection.readyState !== 1) throw unavailable(); return mongoose.connection.db.collection('levoks_rate_limits'); };
// The database clock determines expiry. TTL cleanup is not used to reset quotas.
function mongoStore(id, windowMs, strategy) {
  const prefix = JSON.stringify(strategy === 'identity' ? [serviceId, id, windowMs, strategy] : [serviceId, id, windowMs]);
  const keyFor = key => createHash('sha256').update(prefix + ':' + key).digest('hex');
  const options = {maxTimeMS: 1000, writeConcern: {w: 'majority', wtimeoutMS: 1000}};
  const bounded = async action => {
    let timer;
    try { return await Promise.race([action(), new Promise((_, reject) => {timer = setTimeout(() => reject(unavailable()), 1500);})]); }
    catch { throw unavailable(); }
    finally {clearTimeout(timer);}
  };
  return {
    prefix,
    localKeys: false,
    increment: key => bounded(async () => {
      const expired = {$lte: [{$ifNull: ['$resetTime', new Date(0)]}, '$$NOW']};
      const update = [{$set: {
        totalHits: {$cond: [expired, 1, {$add: ['$totalHits', 1]}]},
        resetTime: {$cond: [expired, {$add: ['$$NOW', windowMs]}, '$resetTime']}
      }}];
      // Concurrent first requests may race on the unique _id upsert; retry once.
      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { result = await collection().findOneAndUpdate({_id: keyFor(key)}, update, {...options, upsert: true, returnDocument: 'after', includeResultMetadata: true}); break; }
        catch (error) { if (error.code !== 11000 || attempt) throw error; }
      }
      if (!result?.value) throw unavailable();
      return {totalHits: result.value.totalHits, resetTime: result.value.resetTime};
    }),
    decrement: key => bounded(() => collection().updateOne({_id: keyFor(key), totalHits: {$gt: 0}}, {$inc: {totalHits: -1}}, options)),
    resetKey: key => bounded(() => collection().deleteOne({_id: keyFor(key)}, options))
  };
}
exports.initialize = async () => { if (configuration.some(c => c.storage === 'mongodb')) await collection().createIndex({resetTime: 1}, {expireAfterSeconds: 0}); };
// Each block has one quota per configured identity, shared by its selected routes. Backend scope
// installs independent service quotas; Mongo counters are shared by replicas.
function principalKey(req) {
  const user = req.user;
  if (typeof user?.sub !== 'string' || !user.sub || user.sub.length > 200 || (user.tenantId !== undefined && (typeof user.tenantId !== 'string' || !user.tenantId || user.tenantId.length > 200))) throw Object.assign(new Error('Verified identity required'), {status: 401});
  return JSON.stringify([user.tenantId || null, user.sub]);
}
const limits = new Map(configuration.map(({id, blockId, local, scope, storage, strategy, ...options}) => [id, rateLimit({...options, ...(strategy === 'identity' ? {keyGenerator: principalKey} : {}), ...(storage === 'mongodb' ? {store: mongoStore(id, options.windowMs, strategy)} : {}), standardHeaders: 'draft-7', legacyHeaders: false})]));
exports.service = configuration.filter(c => c.scope !== 'endpoints').map(c => limits.get(c.id));
exports.endpoint = (ids, strategy = 'ip') => ids.map(id => {const config = configuration.find(c => c.local && c.blockId === id); if (!config) throw new Error('Unknown endpoint rate limit'); return config;}).filter(c => c.scope === 'endpoints' && c.strategy === strategy).map(c => limits.get(c.id));
`;
}
