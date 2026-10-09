import { RESPONSE_HEADERS_RUNTIME } from "@/lib/backend/response-headers";

/** Emitted as a standalone CommonJS module. Interprets validated data, never JavaScript expressions. */
export const PROGRAM_RUNTIME = String.raw`
class WorkflowError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function safeKey(key) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !forbidden.has(key); }
function safeValue(value, depth = 0) {
  if (depth > 30) throw new WorkflowError(400, 'Input nesting is too deep');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if ((!Array.isArray(value) && !safeKey(key))) throw new WorkflowError(400, 'Unsafe field');
    safeValue(child, depth + 1);
  }
  return value;
}
function resolve(value, context) {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  const parts = value.slice(1).split('.');
  if (!parts.every(safeKey)) throw new WorkflowError(400, 'Invalid data binding');
  let result = context;
  for (const part of parts) {
    if (result == null || !Object.prototype.hasOwnProperty.call(result, part)) return undefined;
    result = result[part];
  }
  return safeValue(result);
}
function mapValues(fields, context) {
  const result = Object.create(null);
  for (const [key, binding] of Object.entries(fields)) {
    if (!safeKey(key)) throw new WorkflowError(400, 'Unsafe field');
    const value = resolve(binding, context);
    if (value !== undefined) result[key] = value;
  }
  return result;
}
function publicValue(value, depth = 0) {
  if (depth > 30) throw new WorkflowError(500, 'Response nesting limit exceeded');
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value.toObject === 'function') value = value.toObject();
  if (Array.isArray(value)) return value.map(item => publicValue(item, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([key]) => safeKey(key) && key !== '_levoksSubmissionMail' && !/password|secret|token/i.test(key)).map(([key, child]) => [key, publicValue(child, depth + 1)]));
}
${RESPONSE_HEADERS_RUNTIME}
exports.createWorkflow = (program, models, database, observability, identity, relations) => {
  // ponytail: bounded process-local cache; use an external adapter for shared durability.
  const cache = new Map();
  const blocks = Object.fromEntries(program.blocks.map(block => [block.id, block]));
  function policy(id, principal) {
    const block = blocks[id];
    if (!block || block.type !== 'access_policy') throw new WorkflowError(500, 'Invalid access policy');
    if (!principal || typeof principal.sub !== 'string' || !principal.sub) throw new WorkflowError(401, 'Authentication required');
    const config = block.config;
    if (config.ownerField && config.ownerField === config.tenantField) throw new WorkflowError(500, 'Ownership and tenant fields must be distinct');
    const roleNames = Array.isArray(principal.roles) ? principal.roles : [principal.role || 'user'];
    const capabilities = new Set(program.blocks.filter(b => b.type === 'role' && roleNames.includes(b.config.name)).flatMap(b => b.config.permissions));
    if (config.roles.length && !config.roles.some(role => roleNames.includes(role))) throw new WorkflowError(403, 'Access denied');
    if (!config.permissions.every(permission => capabilities.has(permission))) throw new WorkflowError(403, 'Access denied');
    const scope = Object.create(null);
    if (config.ownerField) {
      if (!safeKey(config.ownerField)) throw new WorkflowError(500, 'Invalid ownership field');
      scope[config.ownerField] = principal.sub;
    }
    if (config.tenantField) {
      if (!safeKey(config.tenantField) || typeof principal.tenantId !== 'string' || !principal.tenantId) throw new WorkflowError(403, 'Tenant access denied');
      scope[config.tenantField] = principal.tenantId;
    }
    return scope;
  }
  return async function execute(endpointId, request, httpResponse) {
    const endpoint = blocks[endpointId];
    if (!endpoint || endpoint.type !== 'rest_endpoint') throw new WorkflowError(500, 'Endpoint not found');
    for (const id of endpoint.config.policyIds || []) policy(id, request.user);
    let context = {request: {body: safeValue(request.body || {}), params: safeValue(request.params || {}), query: safeValue(request.query || {}), headers: safeValue(request.levoksHeaders || {})}, principal: request.user || null};
    let response;
    // Credentials and verification proof never enter the user-bindable context.
    const accounts = new Map(), verified = new Map();
    let sessionAccount;

    let stepsUsed = 0;
    const deadline = Date.now() + 10000;
    const active = new Set();
    async function run(ids, session, depth = 0) {
      if (depth > 40) throw new WorkflowError(422, 'Workflow nesting limit exceeded');
      for (const id of ids) {
        if (++stepsUsed > 2000 || Date.now() > deadline || request.aborted) throw new WorkflowError(408, 'Workflow execution limit exceeded');
        if (active.has(id)) throw new WorkflowError(422, 'Recursive workflow is not allowed');
        const block = blocks[id];
        if (!block) throw new WorkflowError(500, 'Missing workflow block');
        const c = block.config;
        active.add(id);
        try {
          if (block.type === 'credential_lookup') {
            if (!identity || session) throw new WorkflowError(422, 'Identity lookup is unavailable here');
            const user = await identity.findAccount(resolve(c.email, context));
            accounts.set(block.id, user);
            context[c.output] = user ? identity.publicAccount(user) : null;
          } else if (block.type === 'password_verify') {
            if (!identity || !accounts.has(c.lookupId)) throw new WorkflowError(401, 'Account lookup is required');
            const user = accounts.get(c.lookupId);
            await identity.verifyPassword(user, resolve(c.password, context));
            verified.set(block.id, user);
          } else if (block.type === 'session_issue') {
            if (!identity || !httpResponse || !verified.has(c.verificationId) || sessionAccount || session) throw new WorkflowError(401, 'Verified credentials are required');
            sessionAccount = verified.get(c.verificationId);
            context[c.output] = identity.publicAccount(sessionAccount);
          } else if (block.type === 'http_request') {
            if (session) throw new WorkflowError(422, 'HTTP calls cannot run in retried database transactions');
            const origin = new URL(process.env[c.originEnv] || 'invalid:');
            if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new WorkflowError(500, 'Configure a valid upstream origin');
            const url = new URL(c.path, origin);
            if (url.origin !== origin.origin) throw new WorkflowError(500, 'Invalid upstream path');
            for (const [key, value] of Object.entries(mapValues(c.query, context))) url.searchParams.set(key, String(value));
            const headers = {'Content-Type': 'application/json'};
            if (c.bearerTokenEnv) { const token = process.env[c.bearerTokenEnv]; if (!token) throw new WorkflowError(500, 'Upstream credential is not configured'); headers.Authorization = 'Bearer ' + token; }
            let result;
            for (let attempt = 0; attempt <= (c.method === 'GET' ? c.retries : 0); attempt++) {
              try {
                const remaining = Math.min(c.timeoutMs, deadline - Date.now());
                if (remaining <= 0) throw new WorkflowError(504, 'Workflow timed out');
                const upstream = await fetch(url, {method: c.method, headers, redirect: 'error', signal: AbortSignal.timeout(remaining), ...(c.method === 'GET' ? {} : {body: JSON.stringify(mapValues(c.body, context))})});
                if (!upstream.ok) { await upstream.body?.cancel(); throw new WorkflowError(upstream.status >= 500 ? 502 : 424, 'Upstream request failed'); }
                const chunks = []; let bytes = 0;
                if (upstream.body) for await (const chunk of upstream.body) { bytes += chunk.length; if (bytes > 1048576) throw new WorkflowError(502, 'Upstream response is too large'); chunks.push(chunk); }
                result = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
                break;
              } catch (error) {
                if (attempt >= (c.method === 'GET' ? c.retries : 0) || error.status === 424) throw new WorkflowError(error.status || 502, error instanceof WorkflowError ? error.message : 'Upstream request failed');
              }
            }
            context[c.output] = publicValue(safeValue(result));
          } else if (block.type === 'cache') {
            if (session) throw new WorkflowError(422, 'Cache operations cannot run in retried database transactions');
            const rawKey = resolve(c.key, context);
            if (!['string', 'number', 'boolean'].includes(typeof rawKey) || String(rawKey).length > 500) throw new WorkflowError(400, 'Invalid cache key');
            const key = JSON.stringify([c.namespace, request.user?.tenantId || '', request.user?.sub || 'anonymous', rawKey]);
            for (const [id, entry] of cache) if (entry.expires <= Date.now()) cache.delete(id);
            if (c.operation === 'delete') { cache.delete(key); context[c.output] = null; }
            else if (c.operation === 'get') context[c.output] = structuredClone(cache.get(key)?.value ?? null);
            else {
              const value = publicValue(resolve(c.value, context)) ?? null;
              if (Buffer.byteLength(JSON.stringify(value)) > 65536) throw new WorkflowError(422, 'Cache value exceeds 64 KB');
              if (!cache.has(key) && cache.size >= 256) cache.delete(cache.keys().next().value);
              cache.set(key, {value: structuredClone(value), expires: Date.now() + c.ttlSeconds * 1000}); context[c.output] = value;
            }
          } else if (block.type === 'query') {
            const model = models[c.modelId];
            if (!model) throw new WorkflowError(500, 'Query model is not configured');
            const modelBlock = blocks[c.modelId];
            const fields = new Set(modelBlock.config.fields.map(f => f.name).concat('_id'));
            const filter = mapValues(c.filter, context);
            const values = mapValues(c.values, context);
            const mutation = ['update', 'delete', 'restore', 'purge'].includes(c.operation);
            if (mutation && (!Object.keys(c.filter).length || Object.keys(filter).length !== Object.keys(c.filter).length)) throw new WorkflowError(400, 'Every mutation filter must resolve to a value');
            const managed = ['_id', '__v', ...(modelBlock.config.timestamps ? ['createdAt', 'updatedAt'] : []), ...(modelBlock.config.softDelete ? ['deletedAt'] : [])];
            if (Object.keys(values).some(field => managed.includes(field))) throw new WorkflowError(422, 'Model-managed fields cannot be assigned');
            const lifecycle = ['restore', 'purge'].includes(c.operation);
            if ((lifecycle || (c.deleted && c.deleted !== 'exclude')) && !modelBlock.config.softDelete) throw new WorkflowError(422, 'This operation requires a soft-delete model');
            if (c.deleted && c.deleted !== 'exclude' && !['find', 'findOne', 'count', 'aggregate'].includes(c.operation)) throw new WorkflowError(422, 'Deleted-record selection applies only to reads');
            for (const field of [...Object.keys(filter), ...Object.keys(values), ...(c.sortField && c.operation !== 'aggregate' ? [c.sortField] : [])]) if (!fields.has(field)) throw new WorkflowError(422, 'Unknown model field: ' + field);
            const enforcedScope = Object.create(null);
            for (const policyId of new Set([...(endpoint.config.policyIds || []), ...(c.policyId ? [c.policyId] : [])])) {
              const scope = policy(policyId, request.user);
              for (const [key, value] of Object.entries(scope)) {
                if (!fields.has(key)) throw new WorkflowError(500, 'Policy field is not defined on the query model');
                if (Object.prototype.hasOwnProperty.call(enforcedScope, key) && enforcedScope[key] !== value) throw new WorkflowError(403, 'Conflicting access policies');
                enforcedScope[key] = value;
              }
            }
            Object.assign(filter, enforcedScope);
            if (c.operation === 'create') Object.assign(values, enforcedScope);
            else for (const key of Object.keys(enforcedScope)) delete values[key];
            if (modelBlock.config.softDelete) {
              if (lifecycle || c.deleted === 'only') filter.deletedAt = {$ne: null};
              else if (c.deleted !== 'include') filter.deletedAt = null;
            }
            const options = {session, maxTimeMS: Math.max(1, deadline - Date.now())};
            const page = c.page === undefined ? 1 : Number(resolve(c.page, context) ?? 1);
            if (!Number.isInteger(page) || page < 1 || page > 10000) throw new WorkflowError(400, 'Page must be between 1 and 10000');
            let value;
            if (c.operation === 'create') {
              const notification = program.blocks.find(b => b.type === 'submission_notification' && b.config.enabled && b.config.endpointId === endpoint.id && b.config.queryId === block.id && b.config.modelId === c.modelId);
              if (notification) values._levoksSubmissionMail = {id: require('node:crypto').randomUUID(), configId: notification.id, status: 'queued', attempts: 0, dueAt: new Date(), expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000), subject: notification.config.subject, inboxPath: notification.config.inboxPath};
            }
            if (relations && ['create', 'update', 'delete', 'restore', 'purge'].includes(c.operation)) value = await relations.mutate({modelId: c.modelId, operation: c.operation, filter, values, session, maxTimeMS: options.maxTimeMS});
            else if (c.operation === 'find') value = await model.find(filter, null, options).sort(c.sortField ? {[c.sortField]: c.sortDirection === 'desc' ? -1 : 1} : {_id: 1}).skip((page - 1) * c.limit).limit(c.limit).lean();
            else if (c.operation === 'findOne') value = await model.findOne(filter, null, options).lean();
            else if (c.operation === 'count') value = await model.countDocuments(filter).session(session || null).maxTimeMS(options.maxTimeMS);
            else if (c.operation === 'aggregate') {
              const aggregation = c.aggregation || {}, metrics = aggregation.metrics || [];
              if (!metrics.length || metrics.length > 8) throw new WorkflowError(422, 'Configure one to eight aggregate metrics');
              const scalar = (field, numeric = false) => {
                const type = field === '_id' ? 'objectId' : modelBlock.config.fields.find(item => item.name === field)?.type;
                if (!safeKey(field) || !type || /password|secret|token/i.test(field) || ['object', 'array'].includes(type) || (numeric && type !== 'number')) throw new WorkflowError(422, 'Invalid aggregate model field');
                return '$' + field;
              };
              const group = { _id: aggregation.groupBy ? scalar(aggregation.groupBy) : null };
              for (const metric of metrics) {
                if (!safeKey(metric.name) || /password|secret|token/i.test(metric.name) || Object.prototype.hasOwnProperty.call(group, metric.name) || !['count', 'sum', 'avg', 'min', 'max'].includes(metric.operation)) throw new WorkflowError(422, 'Invalid aggregate metric');
                group[metric.name] = metric.operation === 'count' ? {$sum: 1} : {['$' + metric.operation]: scalar(metric.field, ['sum', 'avg'].includes(metric.operation))};
              }
              const sort = c.sortField || '_id';
              if (!Object.prototype.hasOwnProperty.call(group, sort)) throw new WorkflowError(422, 'Unknown aggregate sort field');
              // Mongoose does not cast aggregation stages. Cast the scoped filter
              // with the model before building the bounded, read-only pipeline.
              const match = model.find(filter).cast(model);
              value = await model.aggregate([{$match: match}, {$group: group}, {$sort: {[sort]: c.sortDirection === 'desc' ? -1 : 1}}, {$skip: (page - 1) * c.limit}, {$limit: c.limit}]).option({...options, allowDiskUse: false});
            }
            else if (c.operation === 'create') value = (await model.create([values], options))[0];
            else {
              if (!Object.keys(c.filter).length) throw new WorkflowError(422, 'Update and delete require an explicit filter');
              if (c.operation === 'update') value = await model.findOneAndUpdate(filter, {$set: values}, {...options, new: true, runValidators: true}).lean();
              else if (c.operation === 'delete') value = modelBlock.config.softDelete ? await model.findOneAndUpdate(filter, {$set: {deletedAt: new Date()}}, {...options, new: true}).lean() : await model.findOneAndDelete(filter, options).lean();
              else if (c.operation === 'restore') value = await model.findOneAndUpdate(filter, {$set: {deletedAt: null}}, {...options, new: true, runValidators: true}).lean();
              else if (c.operation === 'purge') value = await model.findOneAndDelete(filter, options).lean();
              else throw new WorkflowError(422, 'Unsupported query operation');
              if (!value) throw new WorkflowError(404, 'Resource not found');
            }
            context[c.output] = publicValue(value);
          } else if (block.type === 'transform') context[c.output] = mapValues(c.fields, context);
          else if (block.type === 'response') { response = {status: c.status, body: [204, 205, 304].includes(c.status) ? null : publicValue(resolve(c.value, context)), ...(c.headers?.length ? {headers: responseHeaders(c.headers, context)} : {})}; }
          else if (block.type === 'access_policy') policy(block.id, request.user);
          else if (block.type === 'transaction') {
            if (session) throw new WorkflowError(422, 'Nested transactions are not supported');
            const transaction = await database.startSession();
            const before = structuredClone(context);
            const beforeResponse = response;
            try {
              await transaction.withTransaction(async () => { context = structuredClone(before); response = beforeResponse; await run(c.steps, transaction, depth + 1); if (observability?.transaction) await observability.transaction(request, endpoint.id, block.id, transaction); }, {readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}, maxCommitTimeMS: 5000});
              context[c.output] = context.result ?? null;
            } catch (error) { context = before; response = beforeResponse; throw error; }
            finally { await transaction.endSession(); }
          } else if (block.type === 'function') {
            const outer = context;
            context = {...context, input: mapValues(c.inputs, context)};
            try { await run(c.steps, session, depth + 1); outer[c.output] = resolve(c.result, context); }
            finally { context = outer; }
          } else if (block.type === 'logic_if') {
            const p = c.program;
            if (!p) throw new WorkflowError(422, 'Configure the condition');
            const a = resolve(p.left, context), b = resolve(p.right, context);
            const numeric = typeof a === 'number' && typeof b === 'number';
            const yes = p.operator === 'eq' ? a === b : p.operator === 'ne' ? a !== b : p.operator === 'exists' ? a !== undefined && a !== null : numeric && (p.operator === 'gt' ? a > b : p.operator === 'gte' ? a >= b : p.operator === 'lt' ? a < b : a <= b);
            await run(yes ? p.thenSteps : p.elseSteps, session, depth + 1);
          } else if (block.type === 'logic_loop') {
            const p = c.program;
            if (!p) throw new WorkflowError(422, 'Configure the loop');
            const items = resolve(p.source, context);
            if (!Array.isArray(items) || items.length > p.maxIterations) throw new WorkflowError(422, 'Loop collection exceeds its configured limit');
            const previous = context.item;
            try { for (const item of items) { context.item = item; await run(p.steps, session, depth + 1); } }
            finally { if (previous === undefined) delete context.item; else context.item = previous; }
          } else if (block.type === 'logic_trycatch') {
            const p = c.program;
            if (!p) throw new WorkflowError(422, 'Configure error handling');
            try { await run(p.steps, session, depth + 1); }
            catch (error) {
              // Authentication, authorization and execution limits cannot be converted into success by a catch branch.
              if (error.relationshipMutation || [401, 403, 408].includes(error.status) || !p.catchSteps.length) throw error;
              context.error = {status: error.status || 500, message: error.status && error.status < 500 ? error.message : 'Operation failed'};
              await run(p.catchSteps, session, depth + 1);
            } finally { await run(p.finallySteps, session, depth + 1); }
          } else if (block.type === 'validation') {
            const value = context.request.body[c.fieldName];
            for (const rule of c.rules) {
              const valid = rule.type === 'required' ? value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0) : value === undefined ? true : rule.type === 'email' ? typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : rule.type === 'minLength' ? typeof value === 'string' && value.length >= Number(rule.value) : rule.type === 'maxLength' ? typeof value === 'string' && value.length <= Number(rule.value) : rule.type === 'min' ? typeof value === 'number' && value >= Number(rule.value) : rule.type === 'max' ? typeof value === 'number' && value <= Number(rule.value) : false;
              if (!valid) throw new WorkflowError(400, rule.message || 'Validation failed');
            }
          } else throw new WorkflowError(422, 'Block is not executable: ' + block.type);
          if (block.connections.length) await run(block.connections, session, depth + 1);
        } finally { active.delete(id); }
      }
    }
    await run(endpoint.connections, null);
    const output = response || {status: 200, body: publicValue(context.result ?? null)};
    if (output.status >= 200 && output.status < 300 && endpoint.config.responseBody?.length) {
      if (!output.body || typeof output.body !== 'object' || Array.isArray(output.body)) throw new WorkflowError(500, 'Response does not match endpoint contract');
      for (const field of endpoint.config.responseBody) {
        const value = output.body[field.name];
        if (value === undefined && !field.required) continue;
        const valid = field.type === 'array' ? Array.isArray(value) : field.type === 'date' ? typeof value === 'string' && !Number.isNaN(Date.parse(value)) : field.type === 'objectId' ? typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) : typeof value === field.type && (field.type !== 'object' || !Array.isArray(value));
        if (!valid || value === null || value === undefined) throw new WorkflowError(500, 'Response does not match endpoint contract');
      }
    }
    // Commit cookies/session only after the entire workflow and response succeed.
    if (sessionAccount && output.status >= 200 && output.status < 300) await identity.issueSession(sessionAccount, request, httpResponse);
    return output;
  };
};
`;
