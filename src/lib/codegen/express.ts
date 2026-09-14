// ═══════════════════════════════════════════════════
// Code Generation — Express.js Generator
// ═══════════════════════════════════════════════════

import {
    ServiceContainer,
    BackendBlock,
    EndpointConfig,
    DbModelConfig,
    MiddlewareConfig,
    AuthConfig,
    SchemaField,
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
import { authController } from "./auth";
import { authSessionRuntime } from "./auth-session";
import { authRecoveryRuntime, IDENTITY_EMAIL_WORKER } from "./auth-recovery";
import { healthRuntime, healthConfiguration } from "./health";
import { observabilityRuntime } from "./observability";
import { programFiles } from "@/lib/backend/program";

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
function generateModel(block: BackendBlock, identityModel = false): string {
    const config = block.config as DbModelConfig;
    const fields = config.fields.map((f) => {
        let fieldDef = `    ${JSON.stringify(f.name)}: {\n      type: ${mongooseType(f.type)}`;
        if (f.required) fieldDef += `,\n      required: true`;
        if (f.unique) fieldDef += `,\n      unique: true`;
        if (f.indexed) fieldDef += `,\n      index: true`;
        if (/password|token|secret/i.test(f.name)) fieldDef += `,\n      select: false`;
        if (identityModel && f.name === "email") fieldDef += `,\n      unique: true, lowercase: true, trim: true`;
        if (f.defaultValue) fieldDef += `,\n      default: ${JSON.stringify(f.defaultValue)}`;
        if (f.ref) fieldDef += `,\n      ref: ${JSON.stringify(f.ref)}`;
        fieldDef += `\n    }`;
        return fieldDef;
    }).join(",\n");

    const opts: string[] = [];
    if (config.timestamps) opts.push("  timestamps: true");

    const identityFields = identityModel && config.fields.some(f => f.name === "password") ? ",\n    authVersion: {type: Number, default: 0, select: false},\n    disabledAt: {type: Date, default: null, select: false},\n    emailVerifiedAt: {type: Date, default: null},\n" + ['authReset', 'authVerify'].map(prefix => `    ${prefix}Hash: {type: String, select: false},\n    ${prefix}ExpiresAt: {type: Date, select: false},\n    ${prefix}RequestedAt: {type: Date, select: false},\n    ${prefix}Mail: {type: mongoose.Schema.Types.Mixed, select: false}`).join(',\n') : "";
    return MODEL_TEMPLATE(config.tableName, fields + identityFields + (config.softDelete ? ",\n    deletedAt: { type: Date, default: null, index: true }" : "")).replace("timestamps: true", `timestamps: ${config.timestamps}`);
}

// ─── Generate route handler for an endpoint ───
function generateEndpointHandler(block: BackendBlock, models: string[], fields: SchemaField[], identityModel: boolean): string {
    const config = block.config as EndpointConfig;
    const method = config.method.toLowerCase();
    if (block.connections.length) return `router.${method}(${JSON.stringify(config.route)}, ${config.authRequired || config.policyIds?.length ? "auth, " : ""}validateBody(${JSON.stringify(config.requestBody)}), async (req, res, next) => { try { const output = await workflow(${JSON.stringify(block.id)}, req); if (output.status === 204) return res.status(204).end(); res.status(output.status).json(output.body ?? null); } catch (error) { next(error); } });`;
    const modelName = models.length > 0 ? models[0] : null;
    if (identityModel) {
        const action = config.route.split("/").pop();
        if (action === "register" || action === "login") return `router.post(${JSON.stringify(config.route)}, identity.limit, validateBody(${JSON.stringify(config.requestBody)}), validateRules, identity.${action});`;
        if (action === "profile") return `router.get(${JSON.stringify(config.route)}, auth, identity.profile);`;
        if (action === "logout") return `router.post(${JSON.stringify(config.route)}, auth, identity.logout);`;
        if (action === "refresh") return `router.post(${JSON.stringify(config.route)}, identity.limit, identity.refresh);`;
        if (action === "sessions") return `router.get(${JSON.stringify(config.route)}, auth, identity.sessions);`;
        if (action === "introspect") return `router.post(${JSON.stringify(config.route)}, auth, (req, res) => {res.set('Cache-Control', 'no-store'); res.json(req.user);});`;
        if (["forgot-password", "request-verification", "reset-password", "verify-email"].includes(action || "")) {
            const fields = action === "forgot-password" || action === "request-verification" ? [{name: "email", type: "string", required: true}] : [{name: "token", type: "string", required: true}, ...(action === "reset-password" ? [{name: "newPassword", type: "string", required: true}] : [])];
            return `router.post(${JSON.stringify(config.route)}, identity.limit, validateBody(${JSON.stringify(fields)}), identity[${JSON.stringify(action)}]);`;
        }
        if (["logout-all", "revoke-session", "change-password"].includes(action || "")) {
            const input = action === "revoke-session" ? [{name: "sessionId", type: "string", required: true}] : action === "change-password" ? [{name: "currentPassword", type: "string", required: true}, {name: "newPassword", type: "string", required: true}] : [];
            return `router.post(${JSON.stringify(config.route)}, auth, identity.limit, validateBody(${JSON.stringify(input)}), identity[${JSON.stringify(action)}]);`;
        }
    }

    // Build handler body based on method
    let handlerBody: string;
    if (modelName) {
        switch (config.method) {
            case "GET":
                if (config.route.includes(":id")) {
                    handlerBody = `  try {
    const item = await ${modelName}.findById(req.params.id);
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
                } else {
                    handlerBody = `  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const items = await ${modelName}.find({}).limit(limit).skip((page - 1) * limit);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
                }
                break;
            case "POST":
                handlerBody = `  try {
    const item = new ${modelName}(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }`;
                break;
            case "PUT":
                handlerBody = `  try {
    const item = await ${modelName}.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }`;
                break;
            case "DELETE":
                handlerBody = `  try {
    const item = await ${modelName}.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: '${modelName} not found' });
    res.json({ message: '${modelName} deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }`;
                break;
            default:
                handlerBody = `  try {
    const item = await ${modelName}.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
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

    const authMiddleware = config.authRequired ? "auth, " : "";
    const inputFields = config.requestBody.length ? config.requestBody : fields.filter(f => !/password|token|secret|role/i.test(f.name));
    return `router.${method}(${JSON.stringify(config.route)}, ${authMiddleware}validateBody(${JSON.stringify(inputFields)}), validateRules, async (req, res, next) => {\n${handlerBody.replaceAll(/res.status\((400|500)\).json\(\{ error: error.message \}\)/g, 'next(error)')}\n});`;
}

// ─── Generate middleware setup ───
function generateMiddlewareSetup(block: BackendBlock): string {
    const config = block.config as MiddlewareConfig;
    switch (config.middlewareType) {
        case "cors":
            return `// CORS is configured centrally using CORS_ORIGINS.`;
        case "rateLimit":
            return `app.use(require('express-rate-limit')({ windowMs: ${(config.rateLimitWindow || 15) * 60 * 1000}, max: ${config.rateLimit || 100} }));`;
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

    // Separate blocks by type
    const endpoints = service.blocks.filter((b) => b.type === "rest_endpoint");
    const models = service.blocks.filter((b) => b.type === "db_model");
    const middlewares = service.blocks.filter((b) => b.type === "middleware");
    const authBlocks = service.blocks.filter((b) => b.type === "auth_block");
    const envVars = service.blocks.filter((b) => b.type === "env_var");
    const identityId = (authBlocks.find(b => (b.config as AuthConfig).identityServiceId)?.config as AuthConfig | undefined)?.identityServiceId;
    const remoteIdentity = allServices.find(s => s.id === identityId);
    const introspectionPath = (remoteIdentity?.blocks.find(b => b.type === "rest_endpoint" && (b.config as EndpointConfig).route.endsWith('/introspect'))?.config as EndpointConfig | undefined)?.route;

    const modelNames = models.map((m) => (m.config as DbModelConfig).tableName);
    const identityModel = authBlocks.some(b => (b.config as AuthConfig).strategy === "jwt") && models.some(m => (m.config as DbModelConfig).fields.some(f => f.name === "password"));

    // 1. Generate models
    models.forEach((model) => {
        const config = model.config as DbModelConfig;
        let generatedModel = generateModel(model, identityModel);
        if (identityModel && config.fields.some(f => f.name === "password")) generatedModel = generatedModel.replace('module.exports =', ['authReset', 'authVerify'].map(prefix => `${config.tableName}Schema.index({"${prefix}Mail.status": 1, "${prefix}Mail.dueAt": 1});\n${config.tableName}Schema.index({"${prefix}Hash": 1}, {sparse: true});`).join('\n') + '\nmodule.exports =');
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
                const effective = e.connections.length && programAuth ? {...e, config: {...e.config, authRequired: true}} : e;
                return generateEndpointHandler(effective, boundConfig ? [boundConfig.tableName] : modelNames, boundConfig?.fields || [], identityModel);
            })
            .join("\n\n");

        files[`${servicePath}/routes/index.js`] = `const express = require('express');\nconst router = express.Router();\n${endpoints.some(e => e.connections.length) ? "const workflow = require('../workflow');\n" : ""}const { validateBody, validateRules } = require('../middleware/validate');\n${identityModel ? "const identity = require('../controllers/identity');\n" : ""}${authImport}${modelImports}\n\n${endpointCode}\n\nmodule.exports = router;`;
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
    const middlewareSetup = middlewares.map((m) => generateMiddlewareSetup(m)).join("\n");
    const routeImport = endpoints.length > 0 ? "const routes = require('./routes');" : "";
    const routeSetup = endpoints.length > 0 ? "app.use('/', routes);" : "// No routes configured";

    files[`${servicePath}/server.js`] = SERVER_TEMPLATE(
        service.port,
        routeImport,
        middlewareSetup,
        routeSetup,
        (middlewares.find(m => (m.config as MiddlewareConfig).middlewareType === "cors")?.config as MiddlewareConfig | undefined)?.corsOrigins
    );

    // 5. package.json
    files[`${servicePath}/package.json`] = PACKAGE_JSON_TEMPLATE(service.name, service.port);
    if (identityModel) {
        const manifest = JSON.parse(files[`${servicePath}/package.json`]);
        manifest.scripts['worker:email'] = 'node workers/identity-email.js';
        files[`${servicePath}/package.json`] = JSON.stringify(manifest, null, 2);
    }

    // 6. .env
    const envMap: Record<string, string> = {
        PORT: String(service.port),
        MONGO_URI: `mongodb://localhost:27017/${servicePath.replace(/-/g, "_")}_db`,
        NODE_ENV: "development",
        CORS_ORIGINS: (middlewares.find(m => (m.config as MiddlewareConfig).middlewareType === "cors")?.config as MiddlewareConfig | undefined)?.corsOrigins || "http://localhost:3000",
    };
    if (hasAuth) {
        if (remoteIdentity) envMap.AUTH_IDENTITY_ORIGIN = `http://localhost:${remoteIdentity.port}`;
        const authConfig = authBlocks[0]?.config as AuthConfig | undefined;
        envMap.JWT_SECRET = "";
        envMap.JWT_EXPIRY = authConfig?.tokenExpiry || "7d";
    }
    envVars.forEach((e) => {
        const cfg = e.config as { key: string; value: string; isSecret: boolean };
        envMap[cfg.key] = cfg.isSecret ? "" : cfg.value.replace(/[\r\n]/g, "");
    });
    files[`${servicePath}/.env.example`] = ENV_TEMPLATE(envMap);
    if (identityModel) files[`${servicePath}/.env.example`] += '\nIDENTITY_PUBLIC_URL=\nIDENTITY_EMAIL_FROM=\nIDENTITY_EMAIL_KEYS=\nIDENTITY_EMAIL_ACTIVE_KEY=\nRESEND_API_KEY=\n';
    files[`${servicePath}/.dockerignore`] = `node_modules\n.env*\n.git\n`;
    files[`${servicePath}/middleware/validate.js`] = `exports.validateBody = (fields) => (req, res, next) => {
  if (req.params.id && !/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid resource ID' });
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
const validations = ${JSON.stringify(service.blocks.filter(b => b.type === "validation").map(b => b.config))};
exports.validateRules = (req, res, next) => {
  if (['GET', 'DELETE'].includes(req.method)) return next();
  for (const validation of validations) {
    const value = req.body[validation.fieldName];
    for (const rule of validation.rules) {
      if (req.method === 'PATCH' && value === undefined) continue;
      const valid = rule.type === 'required' ? value !== undefined && value !== '' : value === undefined ? true : rule.type === 'email' ? typeof value === 'string' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) : rule.type === 'minLength' ? String(value).length >= Number(rule.value) : rule.type === 'maxLength' ? String(value).length <= Number(rule.value) : rule.type === 'min' ? Number(value) >= Number(rule.value) : rule.type === 'max' ? Number(value) <= Number(rule.value) : false;
      if (!valid) return res.status(400).json({ error: rule.message || 'Validation failed' });
    }
  }
  next();
};`;

    // 7. .gitignore
    files[`${servicePath}/.gitignore`] = `node_modules/\n.env\n.DS_Store`;

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

    return files;
}
