import type { SemanticBackendService } from "@/types/backend";
import {
  defaultDatabase,
  isSql,
  DATABASE_ENGINES,
} from "@/lib/backend/database";
import { serviceSlug } from "@/lib/project/schema";
import { modelDefault } from "@/lib/backend/model-defaults";
import { SQL_RUNTIME } from "./sql-runtime";

export function databaseFiles(
  service: SemanticBackendService,
): Record<string, string> {
  const config = service.database || defaultDatabase();
  const name = serviceSlug(service.name).replaceAll("-", "_") + "_db";
  const fallbackName = service.database ? name : service.port === 3001 ? "auth_db" : "app_db";
  if (!isSql(config))
    return {
      "database.js": `const mongoose = require('mongoose');
exports.connect = () => {
  const uri = process.env[${JSON.stringify(config.connectionEnv)}]${config.location === "local" ? ` || ${JSON.stringify(`mongodb://localhost:27017/${fallbackName}`)}` : ""};
  if (!uri) throw new Error(${JSON.stringify(`Set ${config.connectionEnv} to your MongoDB connection URL`)});
  return mongoose.connect(uri, {${config.tls ? "tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false, " : ""}...(process.env.DATABASE_CA_FILE ? {tlsCAFile: process.env.DATABASE_CA_FILE} : {}), serverSelectionTimeoutMS: 5000});
};
exports.disconnect = () => mongoose.disconnect();
`,
    };
  const models = service.blocks
    .filter((b) => b.type === "db_model")
    .map((b) => {
      const config = b.config as import("@/types/backend").DbModelConfig;
      return {
        ...config,
        fields: config.fields.map((field) => {
          const { id, defaultValue, ...properties } = field;
          void id;
          void defaultValue;
          const value = modelDefault(field);
          return {
            ...properties,
            ...(value !== undefined ? { default: value } : {}),
          };
        }),
      };
    });
  return {
    "database.js": SQL_RUNTIME,
    "database.config.json": JSON.stringify(config, null, 2),
    "database.models.json": JSON.stringify(models, null, 2),
    "scripts/migrate.js": `require('dotenv').config();
const database = require('../database');
database.migrate().then(() => console.log('Database schema is ready')).catch(error => {console.error(error.status ? 'Database initialization failed' : 'Check the connection and existing schema before retrying. No existing tables are changed.'); process.exitCode = 1;}).finally(() => database.disconnect());`,
    "DATABASE.md": `# ${DATABASE_ENGINES[config.engine]} storage\n\nThis service uses ${config.location === "remote" ? "your remote/managed server" : config.engine === "sqlite" ? "a local SQLite file" : "your local/self-hosted server"}. Configure ${config.connectionEnv} in .env or your hosting environment. No credentials are stored in the Levoks project.\n\n${config.engine === "sqlite" ? `Default path: ./data/${config.fileName}. Set ${config.connectionEnv} to an absolute or relative file path to store data elsewhere. Keep this file on persistent storage and back it up. SQLite uses one process-local connection; use a server database for multiple replicas.` : `Use a ${config.engine === "postgresql" ? "postgresql" : "mysql"}://user:URL_ENCODED_PASSWORD@host:port/database URL. The sslmode=require, verify-ca and verify-full URL options enable verified TLS. Other URL query options are rejected. TLS is also controlled by the saved Require TLS option (${config.tls ? "enabled" : "disabled"}). Certificates are verified. For a private CA, set DATABASE_CA_FILE to its PEM file. This works with compatible managed services or a server you operate. Create the database and least-privilege credentials first.`}\n\nRun npm install, copy .env.example to .env and configure the connection, then run npm run db:migrate once before npm start. This creates missing initial application tables, required/unique/index constraints and a schema fingerprint. It does not alter existing tables or move data between engines. Run setup once, before starting replicas. Startup rejects a changed model fingerprint: review and apply your schema/data migration before updating the fingerprint in levoks_schema. Keep backups; never delete existing tables to bypass this check. Defaults and timestamps are applied by the generated application on writes. Indexed text has a 191-character limit. IDs remain 24 hexadecimal characters for API compatibility.\n\nResource CRUD, bounded queries/aggregates, policies, soft deletion and transactions use the selected engine. Identity account controllers, durable audit logs and MongoDB-backed rate limits require a separate MongoDB service. Resource services can verify identity through that service. Engine switching changes future exports; it does not migrate existing data.\n`,
  };
}

export function databaseEnvironment(service: SemanticBackendService) {
  const config = service.database || defaultDatabase();
  const name = serviceSlug(service.name).replaceAll("-", "_") + "_db";
  return {
    [config.connectionEnv]:
      config.engine === "sqlite"
        ? `./data/${config.fileName}`
        : config.location === "remote"
          ? ""
          : config.engine === "mongodb"
            ? `mongodb://localhost:27017/${name}`
            : `${config.engine === "postgresql" ? "postgresql" : "mysql"}://levoks:CHANGE_ME@localhost:${config.engine === "postgresql" ? 5432 : 3306}/${name}`,
  };
}

export function databaseCompose(
  services: SemanticBackendService[],
  infrastructure: {
    name: string;
    port: number;
    identityOrigin?: string;
    healthOrigins?: Record<string, string>;
    operatorSetup?: boolean;
  }[],
) {
  const lines = ["services:"];
  const volumes: string[] = [];
  const emittedDatabases = new Set<string>();
  const legacyReplica = services.some(service => !service.database && service.blocks.some(block => block.type === "relation"));
  const serviceNames = new Set(services.map(service => serviceSlug(service.name)));
  if (services.some(service => !service.database)) serviceNames.add("mongodb");
  const volumeNames = new Set(services.some(service => !service.database) ? ["mongo-data"] : []);
  const allocate = (base: string, names: Set<string>) => {
    let name = base;
    for (let suffix = 2; names.has(name); suffix++) name = `${base}-${suffix}`;
    names.add(name);
    return name;
  };
  for (const service of services) {
    const config = service.database || defaultDatabase();
    const slug = serviceSlug(service.name),
      dbService = service.database ? allocate(`${slug}-database`, serviceNames) : "mongodb",
      volume = service.database ? allocate(`${slug}-data`, volumeNames) : "mongo-data";
    const databaseName = slug.replaceAll("-", "_") + "_db";
    const local = config.location === "local",
      sql = isSql(config),
      sqlite = config.engine === "sqlite";
    const passwordVar =
      slug.replaceAll("-", "_").toUpperCase() + "_DB_PASSWORD";
    const password = "${" + passwordVar + ":?Set a URL-safe database password}";
    if (local && !sqlite && !emittedDatabases.has(dbService)) {
      emittedDatabases.add(dbService);
      const postgres = config.engine === "postgresql",
        mongo = !sql;
      lines.push(
        `  ${dbService}:`,
        `    image: ${mongo ? (service.database ? "mongo:7" : "mongo:6") : postgres ? "postgres:17" : config.engine === "mariadb" ? "mariadb:11" : "mysql:8.4"}`,
        "    volumes:",
        `      - ${volume}:${mongo ? "/data/db" : postgres ? "/var/lib/postgresql/data" : "/var/lib/mysql"}`,
      );
      if (mongo && (service.database || legacyReplica))
        lines.push(
          '    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]',
        );
      if (!mongo) {
        lines.push("    environment:");
        const prefix = postgres
          ? "POSTGRES"
          : config.engine === "mariadb"
            ? "MARIADB"
            : "MYSQL";
        lines.push(
          `      ${prefix}_${postgres ? "DB" : "DATABASE"}: ${databaseName}`,
          `      ${prefix}_USER: levoks`,
          `      ${prefix}_PASSWORD: ${JSON.stringify(password)}`,
        );
        if (!postgres)
          lines.push(`      ${prefix}_RANDOM_ROOT_PASSWORD: "yes"`);
      }
      lines.push(
        "    healthcheck:",
        `      test: ${JSON.stringify(mongo ? ["CMD", "mongosh", "--quiet", "--eval", service.database || legacyReplica ? `try {rs.status()} catch {rs.initiate({_id:'rs0',members:[{_id:0,host:'${dbService}:27017'}]})}; if (!db.hello().isWritablePrimary) quit(1)` : "db.adminCommand({ping:1})"] : postgres ? ["CMD", "pg_isready", "-U", "levoks", "-d", databaseName] : ["CMD", config.engine === "mariadb" ? "mariadb-admin" : "mysqladmin", "ping", "--silent"])}`,
        "      interval: 5s",
        "      timeout: 5s",
        "      retries: 20",
        "    restart: unless-stopped",
      );
    }
    const environment: Record<string, string> = {
      PORT: String(service.port),
      JWT_SECRET: "${JWT_SECRET:-}",
      CORS_ORIGINS: "${CORS_ORIGINS:-http://localhost:3000}",
    };
    const item = infrastructure.find((item) => item.name === service.name)!;
    if (item.operatorSetup) environment.OPERATOR_SETUP_TOKEN = "${" + slug.replaceAll("-", "_").toUpperCase() + "_OPERATOR_SETUP_TOKEN:-}";
    if (item.identityOrigin)
      environment.AUTH_IDENTITY_ORIGIN = item.identityOrigin;
    Object.assign(environment, item.healthOrigins);
    environment[config.connectionEnv] = sqlite
      ? `/data/${config.fileName}`
      : !local
        ? "${" +
          slug.replaceAll("-", "_").toUpperCase() +
          "_" +
          config.connectionEnv +
          ":?Set the remote database URL}"
        : config.engine === "mongodb"
          ? `mongodb://${dbService}:27017/${databaseName}${service.database || legacyReplica ? "?replicaSet=rs0" : ""}`
          : `${config.engine === "postgresql" ? "postgresql" : "mysql"}://levoks:${password}@${dbService}:${config.engine === "postgresql" ? 5432 : 3306}/${databaseName}`;
    lines.push(
      `  ${slug}:`,
      `    build: ./${slug}`,
      "    ports:",
      `      - "${service.port}:${service.port}"`,
      "    environment:",
      ...Object.entries(environment).map(
        ([key, value]) => `      ${key}: ${JSON.stringify(value)}`,
      ),
    );
    if (sqlite) lines.push("    volumes:", `      - ${volume}:/data`);
    if (local && !sqlite)
      lines.push(
        "    depends_on:",
        `      ${dbService}:`,
        "        condition: service_healthy",
      );
    lines.push("    restart: unless-stopped");
    if (service.blocks.some(b => b.type === "submission_notification")) {
      const prefix = slug.replaceAll("-", "_").toUpperCase();
      const workerEnvironment = {
        [config.connectionEnv]: environment[config.connectionEnv],
        NODE_ENV: "production",
        ...Object.fromEntries(["SUBMISSION_EMAIL_FROM", "SUBMISSION_EMAIL_TO", "SUBMISSION_PUBLIC_ORIGIN", "RESEND_API_KEY"].map(key => [key, "${" + prefix + "_" + key + ":-}"])),
      };
      const workerName = allocate(`${slug}-submission-worker`, serviceNames);
      lines.push(`  ${workerName}:`, `    build: ./${slug}`, '    profiles: ["notifications"]', '    command: ["npm", "run", "worker:submissions"]', "    environment:", ...Object.entries(workerEnvironment).map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`), "    restart: unless-stopped");
      if (local) lines.push("    depends_on:", `      ${dbService}:`, "        condition: service_healthy");
    }
    if (local && !volumes.includes(volume)) volumes.push(volume);
  }
  if (volumes.length)
    lines.push("volumes:", ...volumes.map((name) => `  ${name}:`));
  return lines.join("\n") + "\n";
}
