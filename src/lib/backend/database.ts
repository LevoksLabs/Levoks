import { z } from "zod";

export const DATABASE_ENGINES = {
  mongodb: "MongoDB",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
  sqlite: "SQLite",
} as const;
export const databaseSchema = z
  .object({
    engine: z.enum(["mongodb", "postgresql", "mysql", "mariadb", "sqlite"]),
    location: z.enum(["local", "remote"]),
    connectionEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
      .refine(
        (v) =>
          ![
            "PORT",
            "NODE_ENV",
            "PATH",
            "HOME",
            "JWT_SECRET",
            "JWT_EXPIRY",
            "AUTH_IDENTITY_ORIGIN",
            "CORS_ORIGINS",
            "NODE_OPTIONS",
            "DATABASE_CA_FILE",
            "RESEND_API_KEY",
          ].includes(v) && !/^(IDENTITY_|HEALTH_ORIGIN_)/.test(v),
        "Choose a dedicated database environment variable",
      ),
    fileName: z
      .string()
      .regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}\.(sqlite|db)$/),
    tls: z.boolean(),
  })
  .refine(
    (v) => v.engine !== "sqlite" || v.location === "local",
    "SQLite stores a local file; choose a server database for a remote connection",
  );
export type DatabaseConfig = z.infer<typeof databaseSchema>;
export const defaultDatabase = (
  engine: DatabaseConfig["engine"] = "mongodb",
): DatabaseConfig => ({
  engine,
  location: "local",
  connectionEnv:
    engine === "mongodb"
      ? "MONGO_URI"
      : engine === "sqlite"
        ? "DATABASE_FILE"
        : "DATABASE_URL",
  fileName: "app.sqlite",
  tls: false,
});
export const isSql = (database?: DatabaseConfig) =>
  Boolean(database && database.engine !== "mongodb");
