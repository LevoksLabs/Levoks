// ═══════════════════════════════════════════════════
// Code Generation — Express.js Generator
// ═══════════════════════════════════════════════════

import {
    SemanticBackendService as ServiceContainer,
    SemanticBackendBlock as BackendBlock,
    EndpointConfig,
    DbModelConfig,
    MiddlewareConfig,
    AuthConfig,
    SchemaField,
    RelationConfig,
} from "@/types/backend";
import {
    PACKAGE_JSON_TEMPLATE,
    SERVER_TEMPLATE,
    MODEL_TEMPLATE,
    ROUTE_TEMPLATE,
    AUTH_MIDDLEWARE_TEMPLATE,
    CONTROLLER_TEMPLATE,
    ENV_TEMPLATE,
    DOCKERFILE_TEMPLATE,
} from "./templates";
import { serviceSlug } from "@/lib/project/schema";
import { modelDefault } from "@/lib/backend/model-defaults";
import { isSql } from "@/lib/backend/database";
import { databaseFiles, databaseEnvironment } from "./database";
import { authController } from "./auth";
import { authSessionRuntime } from "./auth-session";
import { authRecoveryRuntime, IDENTITY_EMAIL_WORKER } from "./auth-recovery";
import { healthRuntime, healthConfiguration } from "./health";
import { observabilityRuntime } from "./observability";
import { programFiles } from "@/lib/backend/program";
import { rateLimitRuntime } from "./rate-limits";
import { workflowOutputs } from "@/lib/backend/workflow-editor";
import { relationFiles } from "./relations";
import { relationEdges } from "@/lib/backend/relations";
import { corsSource } from "@/lib/backend/cors";
import { submissionNotificationFiles } from "./submission-notifications";
import { VALIDATION_RUNTIME } from "@/lib/backend/validation";

// ─── Field type → Mongoose type ───
function mongooseType(type: SchemaField["type"]): string {
    switch (type) {
        case "string": return "String";
        case "number": return "Number";
        case "boolean": return "Boolean";
        case "date": return "Date";
        case "object": return "mongoose.Schema.Types.Mixed";
        case "array": return "[mongoose.Schema.Types.Mixed]";
        case "objectId": return "mongoose.Schema.Types.ObjectId";
        default: return "String";
    }
}

// ─── Generate model file ───
function generateModel(block: BackendBlock, identityModel = false, submissionNotifications = false): string {
    const config = block.config as DbModelConfig;
    const fields = config.fields.map((f) => {
        let fieldDef = `    ${JSON.stringify(f.name)}: {\n      type: ${mongooseType(f.type)}`;
        if (f.required) fieldDef += `,\n      required: true`;
        if (f.unique) fieldDef += `,\n      unique: true`;
        if (f.indexed) fieldDef += `,\n      index: true`;
        if (/password|token|secret/i.test(f.name)) fieldDef += `,\n      select: false`;
        if (identityModel && f.name === "email") fieldDef += `,\n      unique: true, lowercase: true, trim: true`;
        const defaultValue = modelDefault(f);
        if (defaultValue !== undefined) fieldDef += `,\n      default: ${JSON.stringify(defaultValue)}`;
        if (f.ref) fieldDef += `,\n      ref: ${JSON.stringify(f.ref)}`;
        fieldDef += `\n    }`;
        return fieldDef;
    }).join(",\n");

    const opts: string[] = [];
    if (config.timestamps) opts.push("  timestamps: true");

    const identityFields = identityModel && config.fields.some(f => f.name === "password") ? ",\n    authVersion: {type: Number, default: 0, select: false},\n    disabledAt: {type: Date, default: null, select: false},\n    emailVerifiedAt: {type: Date, default: null},\n" + ['authReset', 'authVerify'].map(prefix => `    ${prefix}Hash: {type: String, select: false},\n    ${prefix}ExpiresAt: {type: Date, select: false},\n    ${prefix}RequestedAt: {type: Date, select: false},\n    ${prefix}Mail: {type: mongoose.Schema.Types.Mixed, select: false}`).join(',\n') : "";
    const bootstrapField = identityFields ? ",\n    operatorBootstrap: { type: String, select: false, unique: true, sparse: true }" : "";
    const notificationField = submissionNotifications ? ",\n    _levoksSubmissionMail: {type: mongoose.Schema.Types.Mixed, select: false}" : "";
    return MODEL_TEMPLATE(config.tableName, fields + identityFields + bootstrapField + notificationField + (config.softDelete ? ",\n    deletedAt: { type: Date, default: null, index: true }" : "")).replace("timestamps: true", `timestamps: ${config.timestamps}`);
}

// ─── Generate route handler for an endpoint ───
function generateEndpointHandler(block: BackendBlock, models: string[], fields: SchemaField[], identityModel: boolean, modelConfig?: DbModelConfig, relationModelId?: string): string {
    const config = block.config as EndpointConfig;
    const softDelete = modelConfig?.softDelete;
    const method = config.method.toLowerCase();
    const middleware = (authenticate = false) => `${config.view ? "(req, res, next) => {res.set('Cache-Control', 'private, no-store'); next();}, " : ""}...require('../middleware/rate-limits').endpoint(${JSON.stringify(config.middlewareIds)}, 'ip'), ${authenticate ? "auth, " : ""}...require('../middleware/rate-limits').endpoint(${JSON.stringify(config.middlewareIds)}, 'identity'), validateParameters(${JSON.stringify({query: config.queryParameters, path: config.pathParameters, header: config.requestHeaders})}), `;
    if (block.connections.length) return `router.${method}(${JSON.stringify(config.route)}, ${middleware(Boolean(config.authRequired || config.policyIds?.length))}${identityModel ? "identity.limit, " : ""}validateBody(${JSON.stringify(config.requestBody)}), async (req, res, next) => { try { const output = await workflow(${JSON.stringify(block.id)}, req${identityModel ? ", res" : ""}); if (output.headers) res.set(output.headers); if ([204, 205, 304].includes(output.status)) return res.status(output.status).end(); res.status(output.status).json(output.body ?? null); } catch (error) { next(error); } });`;
    const modelName = models.length > 0 ? models[0] : null;
    if (identityModel) {
        const action = config.route.split("/").pop();
        if (["register", "login", "operator-setup"].includes(action || "")) return `router.post(${JSON.stringify(config.route)}, ${middleware()}identity.limit, validateBody(${JSON.stringify(config.requestBody)}), validateRules, identity[${JSON.stringify(action)}]);`;
        if (action === "profile") return `router.get(${JSON.stringify(config.route)}, ${middleware(true)}identity.profile);`;
        if (action === "logout") return `router.post(${JSON.stringify(config.route)}, ${middleware(true)}identity.logout);`;
        if (action === "refresh") return `router.post(${JSON.stringify(config.route)}, ${middleware()}identity.limit, identity.refresh);`;
        if (action === "sessions") return `router.get(${JSON.stringify(config.route)}, ${middleware(true)}identity.sessions);`;
        if (action === "introspect") return `router.post(${JSON.stringify(config.route)}, ${middleware(true)}(req, res) => {res.set('Cache-Control', 'no-store'); res.json(req.user);});`;
        if (["forgot-password", "request-verification", "reset-password", "verify-email"].includes(action || "")) {
            const fields = action === "forgot-password" || action === "request-verification" ? [{name: "email", type: "string", required: true}] : [{name: "token", type: "string", required: true}, ...(action === "reset-password" ? [{name: "newPassword", type: "string", required: true}] : [])];
            return `router.post(${JSON.stringify(config.route)}, ${middleware()}identity.limit, validateBody(${JSON.stringify(fields)}), identity[${JSON.stringify(action)}]);`;
        }
        if (["logout-all", "revoke-session", "change-password"].includes(action || "")) {
            const input = action === "revoke-session" ? [{name: "sessionId", type: "string", required: true}] : action === "change-password" ? [{name: "currentPassword", type: "string", required: true}, {name: "newPassword", type: "string", required: true}] : [];
            return `router.post(${JSON.stringify(config.route)}, ${middleware(true)}identity.limit, validateBody(${JSON.stringify(input)}), identity[${JSON.stringify(action)}]);`;
        }
    }

    // Build handler body based on method
    let handlerBody: string;
    if (modelName) {
        switch (config.method) {
            case "GET":
                if (config.route.includes(":id")) {
                    handlerBody = `  try {
    const item = await ${modelName}.findOne({_id: req.params.id${softDelete ? ", deletedAt: null" : ""}});
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
                } else {
                    handlerBody = `  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const items = await ${modelName}.find({${softDelete ? "deletedAt: null" : ""}}).limit(limit).skip((page - 1) * limit);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
                }
                break;
            case "POST":
                handlerBody = `  try {
    const item = await ${modelName}.create(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }`;
                break;
            case "PUT":
                handlerBody = `  try {
    const item = await ${modelName}.findOneAndUpdate({_id: req.params.id${softDelete ? ", deletedAt: null" : ""}}, { $set: req.body }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }`;
                break;
            case "DELETE":
                handlerBody = `  try {
    const item = await ${modelName}.${softDelete ? "findOneAndUpdate({_id: req.params.id, deletedAt: null}, {$set: {deletedAt: new Date()}}, {new: true})" : "findByIdAndDelete(req.params.id)"};
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json({ message: '${modelName} deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
                break;
            default:
                handlerBody = `  try {
    const item = await ${modelName}.findOneAndUpdate({_id: req.params.id${softDelete ? ", deletedAt: null" : ""}}, { $set: req.body }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }`;
        }
    } else {
        handlerBody = `  try {
    res.json({ message: ${JSON.stringify(config.description || block.label)} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
    }

    if (relationModelId && ["POST", "PUT", "PATCH", "DELETE"].includes(config.method)) {
        const operation = config.method === "POST" ? "create" : config.method === "DELETE" ? "delete" : "update";
        handlerBody = `  try {
    const item = await require('../relations').mutate({modelId: ${JSON.stringify(relationModelId)}, operation: ${JSON.stringify(operation)}, ${operation !== "create" ? `filter: {_id: req.params.id${softDelete ? ", deletedAt: null" : ""}}, ` : ""}values: req.body});
    res.status(${operation === "create" ? 201 : 200}).json(${operation === "delete" ? `{message: ${JSON.stringify(`${modelName} deleted successfully`)}}` : "item"});
  } catch (error) { next(error); }`;
    }
    const inputFields = (config.requestBody.length ? config.requestBody : fields.filter(f => !/password|token|secret|role/i.test(f.name)).map(f => f.defaultValue === undefined ? f : {...f, required: false})).filter(f => !["_id", "__v", ...(modelConfig?.timestamps ? ["createdAt", "updatedAt"] : []), ...(softDelete ? ["deletedAt"] : [])].includes(f.name));
    return `router.${method}(${JSON.stringify(config.route)}, ${middleware(config.authRequired)}validateBody(${JSON.stringify(inputFields)}), validateRules, async (req, res, next) => {\n${handlerBody.replaceAll(/res.status\((400|500)\).json\(\{ error: error.message \}\)/g, 'next(error)')}\n});`;
}

// ─── Generate middleware setup ───
function generateMiddlewareSetup(block: BackendBlock): string {
    const config = block.config as MiddlewareConfig;
    switch (config.middlewareType) {
        case "cors":
            return `// CORS is configured centrally using CORS_ORIGINS.`;
        case "rateLimit":
            return ""; // Installed by the scoped rate-limit runtime.
        case "helmet":
            return `app.use(helmet());`;
        case "logger":
            return `// Error and audit logging use the central metadata-only observability runtime.`;
        case "bodyParser":
            return `// Body parser already configured`;
        case "custom":
            return config.customCode || "// Custom middleware";
        default:
            return "";
    }
}

// ─── Main generator for a single service ───
export function generateServiceCode(service: ServiceContainer, allServices: ServiceContainer[] = []): Record<string, string> {
    const files: Record<string, string> = {};
    const servicePath = serviceSlug(service.name);
    const sql = isSql(service.database);
    for (const [name, source] of Object.entries(databaseFiles(service))) files[`${servicePath}/${name}`] = source;
    for (const [name, source] of Object.entries(relationFiles(service))) files[`${servicePath}/${name}`] = source;
    const relations = service.blocks.filter(b => b.type === "relation").map(b => b.config as RelationConfig);
    files[`${servicePath}/middleware/cors.js`] = corsSource(service.blocks.find(b => b.type === "middleware" && (b.config as MiddlewareConfig).middlewareType === "cors")?.config as MiddlewareConfig | undefined, service.blocks.filter(b => b.type === "rest_endpoint").flatMap(b => ((b.config as EndpointConfig).requestHeaders || []).map(field => field.name)));

    // Separate blocks by type
    const endpoints = service.blocks.filter((b) => b.type === "rest_endpoint");
    const models = service.blocks.filter((b) => b.type === "db_model");
    const middlewares = service.blocks.filter((b) => b.type === "middleware");
    const authBlocks = service.blocks.filter((b) => b.type === "auth_block");
    const envVars = service.blocks.filter((b) => b.type === "env_var");
    const workflowTargets = new Set(service.blocks.flatMap(block => workflowOutputs(block).flatMap(output => output.ids)));
    const identityId = (authBlocks.find(b => (b.config as AuthConfig).identityServiceId)?.config as AuthConfig | undefined)?.identityServiceId;
    const remoteIdentity = allServices.find(s => s.id === identityId);
    const introspectionPath = (remoteIdentity?.blocks.find(b => b.type === "rest_endpoint" && (b.config as EndpointConfig).route.endsWith('/introspect'))?.config as EndpointConfig | undefined)?.route;

    const modelNames = models.map((m) => (m.config as DbModelConfig).tableName);
    const identityModel = authBlocks.some(b => (b.config as AuthConfig).strategy === "jwt") && models.some(m => (m.config as DbModelConfig).fields.some(f => f.name === "password"));

    // 1. Generate models
    models.forEach((model) => {
        const config = model.config as DbModelConfig;
        const referenceFields = relations.flatMap(relationEdges).filter(edge => edge.child === model.id);
        const referencedModel = {...model, config: {...config, fields: config.fields.map(field => {
            const edge = referenceFields.find(edge => edge.field === field.name);
            const parent = models.find(m => m.id === edge?.parent)?.config as DbModelConfig | undefined;
            const unique = relations.some(r => r.relationType === "one-to-one" && r.toModel === model.id && r.foreignKey === field.name);
            return parent ? {...field, ref: parent.tableName, indexed: field.indexed || !unique} : field;
        })}};
        const notified = service.blocks.some(b => b.type === "submission_notification" && "modelId" in b.config && b.config.modelId === model.id);
        let generatedModel = sql ? `module.exports = require('../database').model(${JSON.stringify(config.tableName)});` : generateModel(referencedModel, identityModel && config.fields.some(field => field.name === "password"), notified);
        const indexes: string[] = [];
        for (const relation of relations) {
            if (relation.relationType === "one-to-one" && relation.toModel === model.id)
                indexes.push(`${config.tableName}Schema.index(${JSON.stringify({[relation.foreignKey]: 1})}, {name: ${JSON.stringify(`levoks_relation_${relation.foreignKey}`)}, unique: true, partialFilterExpression: ${JSON.stringify({[relation.foreignKey]: {$type: "objectId"}})}});`);
            if (relation.relationType === "many-to-many" && relation.joinModel === model.id)
                indexes.push(`${config.tableName}Schema.index(${JSON.stringify({[relation.foreignKey]: 1, [relation.inverseForeignKey!]: 1})}, {unique: true});`);
        }
        if (indexes.length) generatedModel = generatedModel.replace('module.exports =', indexes.join('\n') + '\nmodule.exports =');
        if (identityModel && config.fields.some(f => f.name === "password")) generatedModel = generatedModel.replace('module.exports =', ['authReset', 'authVerify'].map(prefix => `${config.tableName}Schema.index({"${prefix}Mail.status": 1, "${prefix}Mail.dueAt": 1});\n${config.tableName}Schema.index({"${prefix}Hash": 1}, {sparse: true});`).join('\n') + '\nmodule.exports =');
        if (notified) {
            generatedModel = generatedModel.replace('module.exports =', `${config.tableName}Schema.index({"_levoksSubmissionMail.configId": 1, "_levoksSubmissionMail.status": 1, "_levoksSubmissionMail.dueAt": 1});\n${config.tableName}Schema.set('toJSON', {transform: (doc, value) => {delete value._levoksSubmissionMail; return value;}});\nmodule.exports =`);
        }
        files[`${servicePath}/models/${config.tableName}.js`] = generatedModel;
    });

    // 2. Generate auth middleware if needed
    const programAuth = service.blocks.some(b => b.type === "access_policy");
    const hasAuth = programAuth || authBlocks.length > 0 || endpoints.some((e) => (e.config as EndpointConfig).authRequired || (e.config as EndpointConfig).policyIds?.length);
    if (endpoints.some(e => e.connections.length)) for (const [path, source] of Object.entries(programFiles(service))) files[`${servicePath}/${path}`] = source;
    if (hasAuth) {
        files[`${servicePath}/middleware/auth.js`] = AUTH_MIDDLEWARE_TEMPLATE(identityModel, remoteIdentity ? `http://localhost:${remoteIdentity.port}` : undefined, introspectionPath, `levoks_session_${remoteIdentity?.port || service.port}`);
    }

    // 3. Generate routes
    if (endpoints.length > 0) {
        const modelImports = modelNames
            .map((n) => `const ${n} = require('../models/${n}');`)
            .join("\n");
        const authImport = hasAuth ? "const auth = require('../middleware/auth');\n" : "";
        const endpointCode = endpoints
            .map((e) => {
                const bound = models.find(m => m.id === (e.config as EndpointConfig).modelId) || models[0];
                const boundConfig = bound?.config as DbModelConfig | undefined;
                const pending = [...e.connections], seen = new Set<string>();
                let scoped = false;
                while (pending.length) {
                    const id = pending.pop()!;
                    if (seen.has(id)) continue;
                    seen.add(id);
                    const step = service.blocks.find(block => block.id === id);
                    if (!step) continue;
                    if (step.type === "query" && "policyId" in step.config && step.config.policyId) scoped = true;
                    pending.push(...workflowOutputs(step).flatMap(output => output.ids));
                }
                const effective = scoped ? {...e, config: {...e.config, authRequired: true}} : e;
                return generateEndpointHandler(effective, boundConfig ? [boundConfig.tableName] : modelNames, boundConfig?.fields || [], identityModel, boundConfig, relations.length ? bound?.id : undefined);
            })
            .join("\n\n");

        files[`${servicePath}/routes/index.js`] = `const express = require('express');\nconst router = express.Router();\n${endpoints.some(e => e.connections.length) ? "const workflow = require('../workflow');\n" : ""}const { validateBody, validateRules, validateParameters } = require('../middleware/validate');\n${identityModel ? "const identity = require('../controllers/identity');\n" : ""}${authImport}${modelImports}\n\n${endpointCode}\n\nmodule.exports = router;`;
        if (identityModel) {
            const config = authBlocks.find(b => (b.config as AuthConfig).strategy === "jwt")!.config as AuthConfig;
            const identityName = (models.find(m => (m.config as DbModelConfig).fields.some(f => f.name === "password"))!.config as DbModelConfig).tableName;
            files[`${servicePath}/controllers/identity.js`] = authController(identityName, Math.min(14, Math.max(10, config.hashRounds || 12)), config.requireVerifiedEmail);
            files[`${servicePath}/identity/sessions.js`] = authSessionRuntime(identityName, config.tokenExpiry || "15m", config.refreshDays ?? 7, config.idleMinutes ?? 60, `_${service.port}`);
            files[`${servicePath}/identity/recovery.js`] = authRecoveryRuntime(identityName, Math.min(14, Math.max(10, config.hashRounds || 12)));
            files[`${servicePath}/workers/identity-email.js`] = IDENTITY_EMAIL_WORKER;
        }
    }

    // 4. Generate server.js
    files[`${servicePath}/middleware/rate-limits.js`] = rateLimitRuntime(service, allServices);
    const middlewareSetup = "require('./middleware/rate-limits').service.forEach(limit => app.use(limit));\n" + middlewares.map((m) => generateMiddlewareSetup(m)).join("\n");
    const routeImport = endpoints.length > 0 ? "const routes = require('./routes');" : "";
    const routeSetup = endpoints.length > 0 ? "app.use('/', routes);" : "// No routes configured";

    files[`${servicePath}/server.js`] = SERVER_TEMPLATE(
        service.port,
        routeImport,
        middlewareSetup,
        routeSetup
    );
    if (relations.length) files[`${servicePath}/server.js`] = files[`${servicePath}/server.js`]
        .replace('await observability.initialize();', "await require('./relations').initialize();\n    await observability.initialize();")
        .replace("console.error('Service startup failed. Check database and observability configuration.');", "if (err.message === 'Relations require a MongoDB replica set') console.error('Relations require a MongoDB replica set or sharded cluster. See RELATIONS.md.');\n    else console.error('Service startup failed. Check database and observability configuration.');");

    // 5. package.json
    files[`${servicePath}/package.json`] = PACKAGE_JSON_TEMPLATE(service.name, service.port);
    if (sql) {
        const manifest = JSON.parse(files[`${servicePath}/package.json`]);
        delete manifest.dependencies.mongoose;
        manifest.dependencies.knex = "^3.1.0";
        const driver = service.database!.engine === "sqlite" ? "better-sqlite3" : service.database!.engine === "postgresql" ? "pg" : "mysql2";
        manifest.dependencies[driver] = driver === "better-sqlite3" ? "^12.0.0" : driver === "pg" ? "^8.16.0" : "^3.14.0";
        manifest.scripts['db:migrate'] = 'node scripts/migrate.js';
        files[`${servicePath}/package.json`] = JSON.stringify(manifest, null, 2);
    }
    if (identityModel) {
        const identityName = (models.find(m => (m.config as DbModelConfig).fields.some(f => f.name === "password"))!.config as DbModelConfig).tableName;
        files[`${servicePath}/server.js`] = files[`${servicePath}/server.js`].replace('await observability.initialize();', `await require('./models/${identityName}').init();\n    await observability.initialize();`);
        const manifest = JSON.parse(files[`${servicePath}/package.json`]);
        manifest.scripts['worker:email'] = 'node workers/identity-email.js';
        files[`${servicePath}/package.json`] = JSON.stringify(manifest, null, 2);
    }
    const notificationFiles = submissionNotificationFiles(service);
    for (const [path, source] of Object.entries(notificationFiles)) files[`${servicePath}/${path}`] = source;
    if (Object.keys(notificationFiles).length) {
        const manifest = JSON.parse(files[`${servicePath}/package.json`]);
        manifest.scripts['worker:submissions'] = 'node workers/submission-email.js';
        manifest.scripts['notifications:status'] = 'node scripts/notification-status.js';
        files[`${servicePath}/package.json`] = JSON.stringify(manifest, null, 2);
        const names = models.filter(m => service.blocks.some(b => b.type === 'submission_notification' && 'modelId' in b.config && b.config.modelId === m.id)).map(m => (m.config as DbModelConfig).tableName);
        files[`${servicePath}/server.js`] = files[`${servicePath}/server.js`].replace('await observability.initialize();', names.map(name => `await require('./models/${name}').init();`).join('\n    ') + '\n    await observability.initialize();');
    }

    // 6. .env
    const envMap: Record<string, string> = {
        PORT: String(service.port),
        ...databaseEnvironment(service),
        NODE_ENV: "development",
        CORS_ORIGINS: (middlewares.find(m => (m.config as MiddlewareConfig).middlewareType === "cors")?.config as MiddlewareConfig | undefined)?.corsOrigins || "http://localhost:3000",
    };
    if (hasAuth) {
        if (remoteIdentity) envMap.AUTH_IDENTITY_ORIGIN = `http://localhost:${remoteIdentity.port}`;
        const authConfig = authBlocks[0]?.config as AuthConfig | undefined;
        envMap.JWT_SECRET = "";
        envMap.JWT_EXPIRY = authConfig?.tokenExpiry || "7d";
    }
    for (const block of service.blocks) if (block.type === "http_request") {
        const config = block.config as {originEnv: string; bearerTokenEnv: string};
        envMap[config.originEnv] = "";
        if (config.bearerTokenEnv) envMap[config.bearerTokenEnv] = "";
    }
    envVars.forEach((e) => {
        const cfg = e.config as { key: string; value: string; isSecret: boolean };
        envMap[cfg.key] = cfg.isSecret ? "" : cfg.value.replace(/[\r\n]/g, "");
    });
    files[`${servicePath}/.env.example`] = ENV_TEMPLATE(envMap);
    if (identityModel) files[`${servicePath}/.env.example`] += '\nIDENTITY_PUBLIC_URL=\nIDENTITY_EMAIL_FROM=\nIDENTITY_EMAIL_KEYS=\nIDENTITY_EMAIL_ACTIVE_KEY=\nRESEND_API_KEY=\n';
    if (identityModel && endpoints.some(endpoint => (endpoint.config as EndpointConfig).route.endsWith('/operator-setup'))) files[`${servicePath}/.env.example`] += '\nOPERATOR_SETUP_TOKEN=\n';

    files[`${servicePath}/.dockerignore`] = `node_modules\n.env*\n**/.env*\n.git\ndata\n*.sqlite*\n*.db*\n`;
    files[`${servicePath}/middleware/validate.js`] = `exports.validateParameters = (contracts) => (req, res, next) => {
  for (const [location, fields] of Object.entries(contracts)) {
    if (!fields) continue;
    const source = location === 'path' ? req.params : location === 'header' ? req.headers : req.query;
    const clean = {};
    for (const field of fields) {
      let value = source[location === 'header' ? field.name.toLowerCase() : field.name];
      if (location === 'header' && (req.rawHeaders || []).filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === field.name.toLowerCase()).length > 1) return res.status(400).json({error: 'Repeated ' + field.name});
      if (value === undefined || value === '') { if (field.required) return res.status(400).json({error: field.name + ' is required'}); continue; }
      if (typeof value !== 'string') return res.status(400).json({error: 'Invalid ' + field.name});
      if (location === 'header' && (value.length > 4096 || /[^\\x20-\\x7e]/.test(value))) return res.status(400).json({error: 'Invalid ' + field.name});
      if (field.type === 'number') value = Number(value);
      if (field.type === 'boolean') value = value === 'true' ? true : value === 'false' ? false : null;
      const valid = field.type === 'objectId' ? /^[a-f0-9]{24}$/i.test(value) : field.type === 'date' ? !Number.isNaN(Date.parse(value)) : typeof value === field.type && (field.type !== 'number' || Number.isFinite(value));
      if (!valid || value === null) return res.status(400).json({error: 'Invalid ' + field.name});
      clean[location === 'header' ? field.name.toLowerCase().replaceAll('-', '_') : field.name] = value;
    }
    if (location === 'path') { req.params = clean; req.levoksExplicitPath = true; }
    else if (location === 'header') req.levoksHeaders = clean;
    else Object.defineProperty(req, 'query', {value: clean, configurable: true, writable: true});
  }
  next();
};
exports.validateBody = (fields) => (req, res, next) => {
  if (!req.levoksExplicitPath && req.params.id && !/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid resource ID' });
  if (['GET', 'DELETE'].includes(req.method)) return next();
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Expected an object' });
  const unsafe = value => value && typeof value === 'object' && Object.entries(value).some(([key, child]) => key.startsWith('$') || key.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(key) || unsafe(child));
  if (unsafe(body)) return res.status(400).json({ error: 'Unsafe field name' });
  const clean = {};
  for (const field of fields) {
    const value = body[field.name];
    if (field.required && req.method !== 'PATCH' && (value === undefined || value === '')) return res.status(400).json({ error: field.name + ' is required' });
    if (value === undefined) continue;
    const valid = field.type === 'array' ? Array.isArray(value) : field.type === 'objectId' ? typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) : field.type === 'date' ? typeof value === 'string' && !Number.isNaN(Date.parse(value)) : typeof value === field.type;
    if (!valid || value === null) return res.status(400).json({ error: 'Invalid ' + field.name });
    clean[field.name] = value;
  }
  req.body = clean;
  next();
};
${VALIDATION_RUNTIME}
const validations = ${JSON.stringify(service.blocks.filter(b => b.type === "validation" && !workflowTargets.has(b.id)).map(b => b.config))};
exports.validateRules = (req, res, next) => {
  if (['GET', 'DELETE'].includes(req.method)) return next();
  for (const validation of validations) {
    const value = req.body[validation.fieldName];
    for (const rule of validation.rules) {
      if (req.method === 'PATCH' && value === undefined) continue;
      const valid = validationRuleValid(rule, value, true);
      if (!valid) return res.status(400).json({ error: rule.message || 'Validation failed' });
    }
  }
  next();
};`;

    // 7. .gitignore
    files[`${servicePath}/.gitignore`] = `node_modules/\n.env\n.DS_Store\ndata/\n*.sqlite*\n*.db*`;

    files[`${servicePath}/observability/health.js`] = healthRuntime(service, allServices);
    files[`${servicePath}/observability/index.js`] = observabilityRuntime(service);
    files[`${servicePath}/scripts/check.js`] = `const {readdirSync, readFileSync} = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
let count = 0;
function check(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    if (entry.isSymbolicLink() || ['node_modules', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit', windowsHide: true});
      if (result.error || result.status !== 0) process.exit(1); count++;
    } else if (file.endsWith('.json')) JSON.parse(readFileSync(file, 'utf8'));
  }
}
check(path.resolve(__dirname, '..')); console.log('Validated ' + count + ' JavaScript modules and project JSON.');`;
    files[`${servicePath}/observability/check.js`] = `fetch('http://127.0.0.1:' + (process.env.PORT || ${service.port}) + '/health', {signal: AbortSignal.timeout(4000)}).then(async response => {await response.body?.cancel(); process.exitCode = response.ok ? 0 : 1;}).catch(() => {process.exitCode = 1;});`;
    for (const id of healthConfiguration(service).serviceIds) {
        const target = allServices.find(s => s.id === id);
        if (target) files[`${servicePath}/.env.example`] += `\nHEALTH_ORIGIN_${target.port}=http://localhost:${target.port}`;
    }
    // 8. Dockerfile
    files[`${servicePath}/Dockerfile`] = DOCKERFILE_TEMPLATE(service.port);
    if (service.database?.engine === "sqlite") files[`${servicePath}/Dockerfile`] = files[`${servicePath}/Dockerfile`]
        .replace('RUN npm install --package-lock-only --ignore-scripts && npm ci --omit=dev', 'RUN apk add --no-cache --virtual .native-build python3 make g++ && npm install --package-lock-only --ignore-scripts && npm ci --omit=dev && apk del .native-build')
        .replace('USER node', 'RUN mkdir -p /data && chown node:node /data\nUSER node');

    return files;
}
