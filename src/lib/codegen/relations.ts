import type {
  DbModelConfig,
  RelationConfig,
  SemanticBackendService,
} from "@/types/backend";
import { relationEdges } from "@/lib/backend/relations";

export function relationFiles(
  service: SemanticBackendService,
): Record<string, string> {
  const relations = service.blocks.filter((b) => b.type === "relation");
  if (!relations.length) return {};
  const models = service.blocks.filter((b) => b.type === "db_model");
  const config = {
    models: Object.fromEntries(
      models.map((b) => [
        b.id,
        {
          softDelete: (b.config as DbModelConfig).softDelete,
          timestamps: (b.config as DbModelConfig).timestamps,
        },
      ]),
    ),
    edges: relations.flatMap((b) => relationEdges(b.config as RelationConfig)),
  };
  return {
    "relations/config.json": JSON.stringify(config, null, 2),
    "relations/index.js": `const {createRelations} = require('./runtime');
const mongoose = require('mongoose');
const models = {${models.map((b) => `${JSON.stringify(b.id)}: require('../models/${(b.config as DbModelConfig).tableName}')`).join(",")}};
module.exports = createRelations(require('./config.json'), models, mongoose);
`,
    "relations/runtime.js": RELATION_RUNTIME,
    "RELATIONS.md": `# Resource relationships

Relations enforce references to active records, one-to-one uniqueness and unique many-to-many junction pairs. Foreign keys are ObjectIds. Parent IDs are immutable; editing a foreign key validates its new parent. Scope fields must match on both sides. Owner/tenant policy fields must be included in that scope.

This service requires a MongoDB replica set or sharded deployment. Configure its connection URL in the runtime environment. Startup checks transaction support and creates relation indexes before accepting requests. Existing data requires a reviewed migration and reference validation before adding relations; this export does not backfill or repair old records.

Restrict rejects parent deletion while dependent records exist, including deleted records. Cascade soft-deletes active dependents when the parent uses soft deletion, and permanently deletes all dependents on hard deletion/purge. Unlink removes an optional foreign key, including on deleted dependents. Restoring a parent restores only that parent; separately restore children after their parents are active. A junction uses required foreign keys, so it supports Restrict or Cascade.

Every generated resource mutation uses a database transaction and a shared database lock, including inferred CRUD and explicit query workflows. Concurrent replicas serialize writes to preserve reference checks. Explicit workflow transactions retain their rollback boundary. Cascades are bounded to 1,000 records and 20 levels; exceeding either limit rolls back. This conservative serialization trades write throughput for integrity. Direct database writes and manually edited source must use the same relation repository or equivalent database constraints.

SQL/cross-service relationships, automatic populated reads and schema/data migrations remain unsupported and are not silently generated.
`,
  };
}

/** Standalone repository used by inferred CRUD and the existing workflow interpreter. */
export const RELATION_RUNTIME = String.raw`
class RelationError extends Error {
  constructor(status, message) { super(message); this.status = status; this.publicMessage = message; this.publicCode = 'relation_constraint'; }
}
exports.createRelations = (config, models, mongoose) => {
  let ready;
  const edges = config.edges;
  const same = (a, b) => a != null && b != null && String(a) === String(b);
  const active = (id, extra = {}) => ({...extra, ...(config.models[id].softDelete ? {deletedAt: null} : {})});
  function initialize() {
    if (!ready) ready = (async () => {
      const topology = await mongoose.connection.db.admin().command({hello: 1});
      if (!topology.setName && topology.msg !== 'isdbgrid') throw new Error('Relations require a MongoDB replica set');
      await Promise.all(Object.values(models).map(model => model.init()));
      await mongoose.connection.db.collection('_levoks_relation_locks').updateOne({_id: 'mutations'}, {$setOnInsert: {version: 0}}, {upsert: true});
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  }
  async function checkReferences(modelId, record, options) {
    for (const edge of edges.filter(e => e.child === modelId)) {
      const id = record[edge.field];
      if (id === undefined || id === null) continue;
      const scope = {};
      for (const key of edge.scopeFields) {
        if (record[key] == null) throw new RelationError(409, 'Relationship scope is missing');
        scope[key] = record[key];
      }
      const parent = await models[edge.parent].findOne(active(edge.parent, {_id: id, ...scope}), null, options).lean();
      if (!parent) throw new RelationError(409, 'Referenced record is unavailable in this relationship scope');
    }
  }
  async function modify(input, session, budget, depth = 0) {
    if (++budget.used > 1000 || depth > 20 || Date.now() >= budget.deadline) throw new RelationError(422, 'Relationship mutation exceeds its execution limit');
    const {modelId, operation, filter = {}, values = {}} = input;
    const model = models[modelId];
    if (!model) throw new RelationError(500, 'Relationship model is unavailable');
    const softDelete = config.models[modelId].softDelete;
    const options = {session, maxTimeMS: Math.max(1, budget.deadline - Date.now())};
    const managed = ['_id', '__v', ...(config.models[modelId].timestamps ? ['createdAt', 'updatedAt'] : []), ...(softDelete ? ['deletedAt'] : [])];
    if (Object.keys(values).some(key => managed.includes(key))) throw new RelationError(422, 'Model-managed fields cannot be assigned');
    if (operation === 'create') {
      const candidate = new model(values);
      await candidate.validate();
      await checkReferences(modelId, candidate.toObject(), options);
      return (await model.create([candidate], options))[0].toObject();
    }
    if (!Object.keys(filter).length) throw new RelationError(400, 'A mutation filter is required');
    const current = await model.findOne(filter, null, options).lean();
    if (!current) throw new RelationError(404, 'Resource not found');
    if (operation === 'update' || operation === 'restore') {
      const changes = operation === 'restore' ? {deletedAt: null} : values;
      if (operation === 'restore' && !softDelete) throw new RelationError(422, 'Restore requires a soft-delete model');
      const candidate = {...current, ...changes};
      await checkReferences(modelId, candidate, options);
      // Changing a parent's scope must not strand its existing dependents.
      for (const edge of edges.filter(e => e.parent === modelId)) {
        if (!edge.scopeFields.some(key => !same(current[key], candidate[key]))) continue;
        const dependent = await models[edge.child].findOne({[edge.field]: current._id}, null, options).lean();
        if (dependent) throw new RelationError(409, 'Unlink dependent records before changing relationship scope');
      }
      return model.findOneAndUpdate({_id: current._id}, {$set: changes}, {...options, new: true, runValidators: true}).lean();
    }
    if (!['delete', 'purge'].includes(operation)) throw new RelationError(422, 'Unsupported relationship mutation');
    const hard = operation === 'purge' || !softDelete;
    for (const edge of edges.filter(e => e.parent === modelId)) {
      const children = await models[edge.child].find({[edge.field]: current._id}, null, options).limit(1001 - budget.used).lean();
      if (!children.length) continue;
      if (children.length > 1000 - budget.used) throw new RelationError(422, 'Relationship mutation exceeds its execution limit');
      if (edge.onDelete === 'restrict') throw new RelationError(409, 'Unlink or delete dependent records before deleting this record');
      for (const child of children) {
        if (edge.scopeFields.some(key => !same(current[key], child[key]))) throw new RelationError(409, 'Dependent record has a conflicting relationship scope');
        if (edge.onDelete === 'setNull') {
          if (++budget.used > 1000) throw new RelationError(422, 'Relationship mutation exceeds its execution limit');
          await models[edge.child].updateOne({_id: child._id}, {$unset: {[edge.field]: 1}}, {...options, runValidators: true});
        } else if (hard || !child.deletedAt) {
          await modify({modelId: edge.child, operation: hard ? 'purge' : 'delete', filter: {_id: child._id}}, session, budget, depth + 1);
        } else budget.used++;
      }
    }
    if (hard) return model.findOneAndDelete({_id: current._id}, options).lean();
    return model.findOneAndUpdate({_id: current._id}, {$set: {deletedAt: new Date()}}, {...options, new: true}).lean();
  }
  async function mutate(input) {
    await initialize();
    const deadline = Date.now() + Math.min(10000, input.maxTimeMS || 10000);
    const work = async session => {
      if (Date.now() >= deadline) throw new RelationError(408, 'Relationship transaction timed out');
      // ponytail: service-wide lock serializes writes; partition by proven relation scope if measured throughput requires it.
      await mongoose.connection.db.collection('_levoks_relation_locks').updateOne({_id: 'mutations'}, {$inc: {version: 1}}, {session, maxTimeMS: Math.max(1, deadline - Date.now())});
      return modify(input, session, {used: 0, deadline});
    };
    if (input.session) {
      try { return await work(input.session); }
      catch (error) { error.relationshipMutation = true; throw error; }
    }
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => { result = await work(session); }, {readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}, maxCommitTimeMS: 5000});
      return result;
    } finally { await session.endSession(); }
  }
  return {initialize, mutate};
};
`;
