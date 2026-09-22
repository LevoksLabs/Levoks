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
  return Object.fromEntries(Object.entries(value).filter(([key]) => safeKey(key) && !/password|secret|token/i.test(key)).map(([key, child]) => [key, publicValue(child, depth + 1)]));
}
exports.createWorkflow = (program, models, database, observability) => {
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
  return async function execute(endpointId, request) {
    const endpoint = blocks[endpointId];
    if (!endpoint || endpoint.type !== 'rest_endpoint') throw new WorkflowError(500, 'Endpoint not found');
    for (const id of endpoint.config.policyIds || []) policy(id, request.user);
    let context = {request: {body: safeValue(request.body || {}), params: safeValue(request.params || {}), query: safeValue(request.query || {})}, principal: request.user || null};
    let response;
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
          if (block.type === 'query') {
            const model = models[c.modelId];
            if (!model) throw new WorkflowError(500, 'Query model is not configured');
            const modelBlock = blocks[c.modelId];
            const fields = new Set(modelBlock.config.fields.map(f => f.name).concat('_id'));
            const filter = mapValues(c.filter, context);
            const values = mapValues(c.values, context);
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
            if (modelBlock.config.softDelete) filter.deletedAt = null;
            const options = {session, maxTimeMS: Math.max(1, deadline - Date.now())};
            let value;
            if (c.operation === 'find') value = await model.find(filter, null, options).sort(c.sortField ? {[c.sortField]: c.sortDirection === 'desc' ? -1 : 1} : {_id: 1}).limit(c.limit).lean();
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
                if (!safeKey(metric.name) || Object.prototype.hasOwnProperty.call(group, metric.name) || !['count', 'sum', 'avg', 'min', 'max'].includes(metric.operation)) throw new WorkflowError(422, 'Invalid aggregate metric');
                group[metric.name] = metric.operation === 'count' ? {$sum: 1} : {['$' + metric.operation]: scalar(metric.field, ['sum', 'avg'].includes(metric.operation))};
              }
              const sort = c.sortField || '_id';
              if (!Object.prototype.hasOwnProperty.call(group, sort)) throw new WorkflowError(422, 'Unknown aggregate sort field');
              // Mongoose does not cast aggregation stages. Cast the scoped filter
              // with the model before building the bounded, read-only pipeline.
              const match = model.find(filter).cast(model);
              value = await model.aggregate([{$match: match}, {$group: group}, {$sort: {[sort]: c.sortDirection === 'desc' ? -1 : 1}}, {$limit: c.limit}]).option({...options, allowDiskUse: false});
            }
            else if (c.operation === 'create') value = (await model.create([values], options))[0];
            else {
              if (!Object.keys(c.filter).length) throw new WorkflowError(422, 'Update and delete require an explicit filter');
              if (c.operation === 'update') value = await model.findOneAndUpdate(filter, {$set: values}, {...options, new: true, runValidators: true}).lean();
              else if (c.operation === 'delete') value = modelBlock.config.softDelete ? await model.findOneAndUpdate(filter, {$set: {deletedAt: new Date()}}, {...options, new: true}).lean() : await model.findOneAndDelete(filter, options).lean();
              else throw new WorkflowError(422, 'Unsupported query operation');
              if (!value) throw new WorkflowError(404, 'Resource not found');
            }
            context[c.output] = publicValue(value);
          } else if (block.type === 'transform') context[c.output] = mapValues(c.fields, context);
          else if (block.type === 'response') { response = {status: c.status, body: publicValue(resolve(c.value, context))}; }
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
              if ([401, 403, 408].includes(error.status) || !p.catchSteps.length) throw error;
              context.error = {status: error.status || 500, message: error.status && error.status < 500 ? error.message : 'Operation failed'};
              await run(p.catchSteps, session, depth + 1);
            } finally { await run(p.finallySteps, session, depth + 1); }
          } else if (block.type === 'validation') {
            const value = context.request.body[c.fieldName];
            for (const rule of c.rules) {
              const valid = rule.type === 'required' ? value !== undefined && value !== '' : value === undefined ? true : rule.type === 'email' ? typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : rule.type === 'minLength' ? typeof value === 'string' && value.length >= Number(rule.value) : rule.type === 'maxLength' ? typeof value === 'string' && value.length <= Number(rule.value) : rule.type === 'min' ? typeof value === 'number' && value >= Number(rule.value) : rule.type === 'max' ? typeof value === 'number' && value <= Number(rule.value) : false;
              if (!valid) throw new WorkflowError(400, rule.message || 'Validation failed');
            }
          } else throw new WorkflowError(422, 'Block is not executable: ' + block.type);
          if (block.connections.length) await run(block.connections, session, depth + 1);
        } finally { active.delete(id); }
      }
    }
    await run(endpoint.connections, null);
    return response || {status: 200, body: publicValue(context.result ?? null)};
  };
};
`;
