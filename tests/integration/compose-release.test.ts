import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProject } from "../../src/lib/project/compiler";
import { parseProject } from "../../src/lib/project/schema";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { modelLifecycleFixture } from "../helpers/model-lifecycle-fixture";
import { defaultDatabase } from "../../src/lib/backend/database";
import { addSubmissionFormTemplate } from "../../src/lib/form-destination";
import { useBackendStore } from "../../src/store/backendStore";
import { createSubmissionInbox } from "../../src/lib/submission-inbox";
import { setSubmissionNotifications } from "../../src/lib/backend/submission-notifications";

const execute = promisify(execFile);
const binary = process.env.LEVOKS_COMPOSE_BINARY;

test(
  "native Compose validates the actual generated release across database engines and all optional profiles without a daemon",
  { skip: !binary, timeout: 30000 },
  async () => {
    await access(binary!);
    const base = resolve(".verification/compose-https");
    await mkdir(base, { recursive: true });
    const initial = emptyProject("Compose configuration acceptance");
    restoreProject(initial);
    addSubmissionFormTemplate();
    const service = useBackendStore.getState().services[0];
    const submit = service.blocks.find(
      (block) => block.type === "rest_endpoint",
    )!;
    createSubmissionInbox(service.id, submit.id);
    setSubmissionNotifications(service.id, submit.id, true);
    const captured = captureProject(initial.id, initial.name);
    const full = parseProject({
      ...captured,
      backend: {
        ...captured.backend,
        services: [
          ...captured.backend.services,
          ...(
            ["mongodb", "postgresql", "mysql", "mariadb", "sqlite"] as const
          ).map((engine, index) => ({
            ...modelLifecycleFixture(),
            id: engine,
            name: engine,
            port: 3060 + index,
            database: defaultDatabase(engine),
          })),
        ],
      },
    });
    for (const project of [emptyProject(), full]) {
      const root = await mkdtemp(resolve(base, "release-"));
      const { files, diagnostics } = compileProject(project);
      assert.deepEqual(
        diagnostics.filter((item) => item.severity === "error"),
        [],
      );
      for (const [path, value] of Object.entries(files)) {
        await mkdir(dirname(resolve(root, path)), { recursive: true });
        await writeFile(resolve(root, path), value);
        if (path.startsWith("deployment/") && path.endsWith(".env.example")) {
          const configured = value.replace(
            /^([A-Z][A-Z0-9_]*)=(.*)$/gm,
            (_line, key, original) => {
              const fixture =
                key === "IDENTITY_EMAIL_KEYS"
                  ? JSON.stringify({
                      active: Buffer.alloc(32).toString("base64"),
                    })
                  : key === "IDENTITY_EMAIL_ACTIVE_KEY"
                    ? "active"
                    : key.endsWith("_FROM") || key.endsWith("_TO")
                      ? "acceptance@example.com"
                      : key.includes("PUBLIC")
                        ? "https://app.example.com"
                        : key === "OPERATOR_SETUP_TOKEN"
                          ? ""
                          : original || "acceptance-fixture";
              return `${key}=${fixture}`;
            },
          );
          await writeFile(resolve(root, path.slice(0, -8)), configured);
        }
      }
      const manifest = JSON.parse(files["deployment/manifest.json"]);
      await writeFile(
        resolve(root, ".env"),
        manifest.rootKeys
          .map(
            (key: string) =>
              `${key}=${key === "COMPOSE_PROJECT_NAME" ? "compose-acceptance" : key === "APP_ORIGIN" ? "https://app.example.com" : key === "FRONTEND_PORT" ? "3400" : "random-fixture-value-at-least-thirty-two-characters"}`,
          )
          .join("\n"),
      );
      const runtime = await import(
        pathToFileURL(resolve(root, "deploy.mjs")).href
      );
      let invocations = 0;
      const compose = async (
        _command: string,
        args: string[],
        options: {
          env: NodeJS.ProcessEnv;
          cwd: string;
          timeout: number;
          maxBuffer: number;
          windowsHide: boolean;
        },
      ) => {
        assert.equal(args[0], "compose");
        assert.ok(
          !args.includes("up"),
          "configuration acceptance must never start containers",
        );
        invocations++;
        return execute(binary!, args.slice(1), options);
      };
      await runtime.runDeployment(["check"], compose);
      await runtime.runDeployment(
        [
          "check",
          ...manifest.profiles.map((profile: string) => `--${profile}`),
        ],
        compose,
      );
      assert.equal(invocations, 4);
    }
  },
);
