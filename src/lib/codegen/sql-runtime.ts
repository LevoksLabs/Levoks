/** Resource-model operations used by the existing workflow interpreter and CRUD routes. */
export const SQL_RUNTIME = String.raw`
const {randomBytes, createHash} = require('node:crypto');
const {mkdirSync, readFileSync} = require('node:fs');
const path = require('node:path');
const config = require('./database.config.json');
const definitions = require('./database.models.json');
const sqlite = config.engine === 'sqlite';
const mysql = ['mysql', 'mariadb'].includes(config.engine);
const source = process.env[config.connectionEnv];
let connection;
if (sqlite) {
  const filename = path.resolve(source || path.join('data', config.fileName));
  mkdirSync(path.dirname(filename), {recursive: true});
  connection = {filename};
} else {
  if (!source) throw new Error('Set ' + config.connectionEnv + ' before starting the database service');
  let url;
  try {url = new URL(source);} catch {throw new Error('Invalid database connection URL');}
  if (!(mysql ? ['mysql:', 'mariadb:'] : ['postgres:', 'postgresql:']).includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error('Invalid database connection URL');
  const sslmode = url.searchParams.get('sslmode');
  if (url.hash || [...url.searchParams.keys()].some(key => key !== 'sslmode') || (sslmode && !['require', 'verify-ca', 'verify-full'].includes(sslmode))) throw new Error('Only verified sslmode URL options are supported; use DATABASE_CA_FILE for a private CA');
  connection = {host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || (mysql ? 3306 : 5432)), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)), ...(mysql ? {timezone: 'Z'} : {})};
  if (config.tls || sslmode) connection.ssl = {rejectUnauthorized: true, ...(process.env.DATABASE_CA_FILE ? {ca: readFileSync(process.env.DATABASE_CA_FILE, 'utf8')} : {})};
}
const db = require('knex')({client: sqlite ? 'better-sqlite3' : mysql ? 'mysql2' : 'pg', connection, useNullAsDefault: sqlite, acquireConnectionTimeout: 5000, pool: {min: 0, max: sqlite ? 1 : 10}, compileSqlOnError: false});
exports.db = db;
const schemaHash = createHash('sha256').update(JSON.stringify(definitions)).digest('hex');
const validation = message => Object.assign(new Error(message), {status: 422});
const fieldsFor = definition => [...definition.fields, {name: '_id', type: 'objectId', required: true}, ...(definition.timestamps ? [{name: 'createdAt', type: 'date'}, {name: 'updatedAt', type: 'date'}] : []), ...(definition.softDelete ? [{name: 'deletedAt', type: 'date'}] : [])];
function encode(field, value) {
  if (value === null) return null;
  if (field.type === 'date') return sqlite ? new Date(value).toISOString() : new Date(value);
  if (['object', 'array'].includes(field.type)) return JSON.stringify(value);
  return value;
}
function valid(field, value) {
  if (value === undefined || value === null) {if (field.required) throw validation(field.name + ' is required'); return;}
  const type = field.type;
  const ok = type === 'date' ? (value instanceof Date || typeof value === 'string') && Number.isFinite(new Date(value).getTime())
    : type === 'objectId' ? typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
    : type === 'array' ? Array.isArray(value)
    : type === 'object' ? typeof value === 'object' && !Array.isArray(value)
    : typeof value === type && (type !== 'number' || Number.isFinite(value));
  if (!ok || (field.required && value === '') || (type === 'string' && (field.unique || field.indexed) && value.length > 191)) throw validation('Invalid ' + field.name);
}
function failure(error) {
  if (['23505', 'ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(error.code)) error.status = 409;
  if (['23502', '22001', 'ER_BAD_NULL_ERROR', 'ER_DATA_TOO_LONG', 'SQLITE_CONSTRAINT_NOTNULL'].includes(error.code)) error.status = 422;
  throw error;
}
exports.disconnect = () => db.destroy();
exports.ping = () => db.raw('SELECT 1').timeout(2000);
exports.connect = async () => {
  await exports.ping();
  if (!await db.schema.hasTable('levoks_schema')) throw new Error('Run npm run db:migrate before starting this service');
  const record = await db('levoks_schema').where({id: 'resources'}).first();
  if (record?.hash !== schemaHash) throw new Error('Database schema differs from this export. Apply a reviewed migration before starting');
};
exports.migrate = async () => {
  if (await db.schema.hasTable('levoks_schema')) return exports.connect();
  // Never adopt or alter an existing application's tables automatically.
  for (const definition of definitions) if (await db.schema.hasTable(definition.tableName)) throw new Error('An application table already exists; use a reviewed migration');
  for (const definition of definitions) await db.schema.createTable(definition.tableName, table => {
    if (mysql) {table.engine('InnoDB'); table.charset('utf8mb4'); table.collate('utf8mb4_bin');}
    for (const field of fieldsFor(definition)) {
      const type = field.type;
      const column = type === 'number' ? table.double(field.name) : type === 'boolean' ? table.boolean(field.name)
        : type === 'date' ? (mysql ? table.dateTime(field.name, {precision: 3}) : table.timestamp(field.name, {useTz: true, precision: 3}))
        : ['object', 'array'].includes(type) ? table.json(field.name)
        : type === 'objectId' ? table.string(field.name, 24)
        : field.unique || field.indexed ? table.string(field.name, 191) : table.text(field.name);
      if (field.name === '_id') column.primary();
      if (field.required) column.notNullable();
      const indexName = 'lv_' + createHash('sha256').update(definition.tableName + ':' + field.name).digest('hex').slice(0, 32);
      if (field.unique) table.unique([field.name], {indexName});
      else if (field.indexed || field.name === 'deletedAt') table.index([field.name], indexName);
    }
  });
  await db.schema.createTable('levoks_schema', table => {table.string('id', 50).primary(); table.string('hash', 64).notNullable();});
  await db('levoks_schema').insert({id: 'resources', hash: schemaHash});
};
exports.startSession = async () => {
  const session = {trx: null, withTransaction: action => db.transaction(async trx => {session.trx = trx; try {return await action();} finally {session.trx = null;}}), endSession: async () => {}};
  return session;
};

exports.model = name => {
  const definition = definitions.find(model => model.tableName === name);
  if (!definition) throw new Error('Unknown resource model');
  const fields = Object.fromEntries(fieldsFor(definition).map(field => [field.name, field]));
  const fieldFor = name => {if (!Object.hasOwn(fields, name)) throw validation('Unknown model field'); return fields[name];};
  function decode(row) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).filter(([key]) => !/password|secret|token/i.test(key)).map(([key, value]) => {
      const type = fields[key]?.type;
      return [key, value == null ? value : type === 'boolean' ? Boolean(value) : type === 'date' ? new Date(value).toISOString() : ['object', 'array'].includes(type) && typeof value === 'string' ? JSON.parse(value) : value];
    }));
  }
  function where(query, filter) {
    for (const [name, value] of Object.entries(filter)) {
      const field = fieldFor(name);
      if (name === 'deletedAt' && value && typeof value === 'object' && Object.keys(value).length === 1 && value.$ne === null) query.whereNotNull(name);
      else {valid({...field, required: false}, value); value === null ? query.whereNull(name) : query.where(name, encode(field, value));}
    }
    return query;
  }
  function values(input, create) {
    for (const name of Object.keys(input)) fieldFor(name);
    const result = {};
    for (const field of Object.values(fields)) {
      let value = input[field.name];
      if (value === undefined && create && field.default !== undefined) value = structuredClone(field.default);
      if (create || value !== undefined) valid(field, value);
      if (value !== undefined) result[field.name] = encode(field, value);
    }
    return result;
  }
  class Query {
    constructor(kind, filter = {}, options = {}, update) {this.kind = kind; this.filter = filter; this.options = {...options}; this.update = update;}
    lean() {return this;}
    session(session) {this.options.session = session; return this;}
    maxTimeMS(ms) {this.options.maxTimeMS = ms; return this;}
    option(options) {Object.assign(this.options, options); return this;}
    sort(sort) {this.order = sort; return this;}
    skip(skip) {if (!Number.isInteger(skip) || skip < 0 || skip > 1000000) throw validation('Invalid page'); this.offset = skip; return this;}
    limit(limit) {if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw validation('Invalid limit'); this.maximum = limit; return this;}
    cast() {return this.filter;}
    then(resolve, reject) {this.promise ||= this.execute().catch(failure); return this.promise.then(resolve, reject);}
    async execute() {
      const client = this.options.session?.trx || db;
      const query = () => where(client(name), this.filter).timeout(Math.max(1, this.options.maxTimeMS || 5000));
      if (this.kind === 'count') return Number((await query().count({_count: '*'}).first())._count);
      if (this.kind === 'aggregate') {
        const [match, group, sort, skip, limit] = this.filter;
        const q = where(client(name), match.$match).timeout(Math.max(1, this.options.maxTimeMS || 5000));
        const groups = group.$group, key = groups._id?.slice(1);
        if (key) {fieldFor(key); q.select({_id: key}).groupBy(key);} else q.select(client.raw('NULL as ??', ['_id'])).havingRaw('COUNT(*) > 0');
        const types = {_id: key ? fieldFor(key).type : 'string'};
        for (const [alias, metric] of Object.entries(groups)) {
          if (alias === '_id') continue;
          const [op, field] = Object.entries(metric)[0];
          if (op === '$sum' && field === 1) {q.count({[alias]: '*'}); types[alias] = 'number';}
          else {
            const method = {'$sum': 'sum', '$avg': 'avg', '$min': 'min', '$max': 'max'}[op];
            if (!method) throw validation('Invalid aggregation');
            const definition = fieldFor(field.slice(1));
            types[alias] = definition.type;
            q[method]({[alias]: field.slice(1)});
          }
        }
        for (const [field, direction] of Object.entries(sort.$sort)) q.orderBy(field, direction < 0 ? 'desc' : 'asc');
        const rows = await q.offset(skip.$skip).limit(limit.$limit);
        return rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? v : types[k] === 'number' ? Number(v) : types[k] === 'boolean' ? Boolean(v) : types[k] === 'date' ? new Date(v).toISOString() : v])));
      }
      if (['update', 'delete'].includes(this.kind)) {
        const mutate = async trx => {
          const select = where(trx(name), this.filter);
          if (!sqlite) select.forUpdate();
          const record = await select.first();
          if (!record) return null;
          if (this.kind === 'delete') {await trx(name).where({_id: record._id}).delete(); return decode(record);}
          const patch = values(this.update.$set, false);
          if (definition.timestamps) patch.updatedAt = encode(fields.updatedAt, new Date());
          if (Object.keys(patch).length) await trx(name).where({_id: record._id}).update(patch);
          return decode(await trx(name).where({_id: record._id}).first());
        };
        return this.options.session?.trx ? mutate(client) : db.transaction(mutate);
      }
      const q = query().select('*');
      for (const [field, direction] of Object.entries(this.order || {_id: 1})) {fieldFor(field); q.orderBy(field, direction < 0 ? 'desc' : 'asc');}
      q.offset(this.offset || 0).limit(this.kind === 'one' ? 1 : this.maximum || 100);
      const rows = await q;
      return this.kind === 'one' ? decode(rows[0]) : rows.map(decode);
    }
  }
  return {
    find: (filter = {}, projection, options) => new Query('find', filter, options),
    findOne: (filter = {}, projection, options) => new Query('one', filter, options),
    findById: id => new Query('one', {_id: id}),
    countDocuments: (filter = {}) => new Query('count', filter),
    aggregate: pipeline => new Query('aggregate', pipeline),
    findOneAndUpdate: (filter, update, options) => new Query('update', filter, options, update),
    findOneAndDelete: (filter, options) => new Query('delete', filter, options),
    findByIdAndDelete: id => new Query('delete', {_id: id}),
    create: async (input, options = {}) => {
      const create = async client => {
        const records = [];
        for (const value of Array.isArray(input) ? input : [input]) {
          const record = values({...value, _id: randomBytes(12).toString('hex'), ...(definition.timestamps ? {createdAt: new Date(), updatedAt: new Date()} : {}), ...(definition.softDelete ? {deletedAt: null} : {})}, true);
          await client(name).insert(record);
          records.push(decode(await client(name).where({_id: record._id}).first()));
        }
        return Array.isArray(input) ? records : records[0];
      };
      try {return options.session?.trx ? await create(options.session.trx) : await db.transaction(create);} catch (error) {failure(error);}
    },
  };
};
`;
