import { randomBytes, randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { compileProject } from "@/lib/project/compiler";
import {
  previewProject,
  type PreviewState,
} from "@/lib/project/fullstack-preview";
import { serviceSlug } from "@/lib/project/schema";
import { HttpError } from "./http";

type Run = {
  owner: string;
  state: PreviewState;
  child?: ChildProcess;
  directory: string;
  expires: ReturnType<typeof setTimeout>;
  stopping?: Promise<void>;
};
const storage = globalThis as typeof globalThis & {
  levoksLocalPreviews?: Map<string, Run>;
};
const runs = (storage.levoksLocalPreviews ||= new Map<string, Run>());
const root = () => path.resolve(".levoks-preview");
export function localPreviewOrigin(request: Request) {
  const origin = process.env.LEVOKS_LOCAL_PREVIEW_ORIGIN;
  if (!origin)
    throw new HttpError(
      503,
      "Local full-stack preview is unavailable. Run npm run dev locally to enable it.",
    );
  const target = new URL(request.url);
  target.host = request.headers.get("host") || target.host;
  if (
    target.origin !== origin ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    throw new HttpError(403, `Open ${origin} to use local full-stack preview.`);
  return origin;
}
export function previewOwner(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("levoks_preview_owner="))
    ?.slice("levoks_preview_owner=".length);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export const newPreviewOwner = () => randomBytes(32).toString("hex");
async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
function owned(id: string, owner: string) {
  const run = runs.get(id);
  if (!run || run.owner !== owner)
    throw new HttpError(404, "Preview not found. Start a new preview.");
  return run;
}
export function previewState(id: string, owner: string) {
  return owned(id, owner).state;
}
export async function stopPreview(id: string, owner: string) {
  const run = owned(id, owner);
  if (run.stopping) return run.stopping;
  run.stopping = (async () => {
    clearTimeout(run.expires);
    if (
      run.child &&
      run.child.exitCode === null &&
      run.child.signalCode === null
    ) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (process.platform === "win32" && run.child?.pid)
            execFile(
              "taskkill",
              ["/PID", String(run.child.pid), "/T", "/F"],
              { windowsHide: true },
              () => resolve(),
            );
          else {
            try {
              process.kill(-run.child!.pid!, "SIGKILL");
            } catch {}
            resolve();
          }
        }, 15000);
        run.child!.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        if (run.child!.connected) run.child!.send({ type: "stop" });
        else run.child!.kill();
      });
    }
    run.state = {
      ...run.state,
      phase: "stopped",
      message:
        "Preview stopped. Temporary records and test emails were discarded.",
      emails: [],
      accounts: [],
      origin: undefined,
    };
    // Only our UUID directory can be removed; dependency caches and user projects are outside it.
    if (
      path.dirname(run.directory) === path.join(root(), "sessions") &&
      path.basename(run.directory) === id
    )
      await rm(run.directory, { recursive: true, force: true, maxRetries: 3 });
    runs.delete(id);
  })();
  return run.stopping.catch((error) => {
    run.stopping = undefined;
    throw error;
  });
}
export async function startPreview(
  value: unknown,
  owner: string,
  editorOrigin: string,
) {
  const project = previewProject(value);
  const original = compileProject(project);
  const errors = original.diagnostics.filter((d) => d.severity === "error");
  if (errors.length)
    throw new HttpError(
      400,
      errors
        .slice(0, 3)
        .map((d) => d.message)
        .join(" "),
    );
  // ponytail: two local runs, eight services and a 30-minute lifetime; hosted/container scheduling is separate.
  if ([...runs.values()].some((run) => run.owner === owner))
    throw new HttpError(
      409,
      "Stop the current preview before starting another.",
    );
  if (runs.size >= 2)
    throw new HttpError(
      429,
      "Two local previews are already running. Stop one before starting another.",
    );
  const id = randomUUID(),
    directory = path.join(root(), "sessions", id),
    expiresAt = Date.now() + 30 * 60 * 1000;
  const state: PreviewState = {
    id,
    phase: "starting",
    message: "Preparing the generated application…",
    expiresAt,
    accounts: [],
    inboxes: [],
    emails: [],
  };
  const run: Run = {
    owner,
    state,
    directory,
    expires: setTimeout(
      () => {
        void stopPreview(id, owner).catch(() => undefined);
      },
      30 * 60 * 1000,
    ),
  };
  run.expires.unref();
  runs.set(id, run);
  try {
    // Temporary service ports also isolate generated session-cookie names between runs.
    const allocated = new Set<number>();
    const allocate = async () => {
      let port = await freePort();
      while (allocated.has(port)) port = await freePort();
      allocated.add(port);
      return port;
    };
    for (const service of project.backend.services)
      service.port = await allocate();
    const frontendPort = await allocate(),
      origin = `http://127.0.0.1:${frontendPort}`;
    const compiled = compileProject(project);
    if (compiled.diagnostics.some((d) => d.severity === "error"))
      throw new Error("Preview compilation failed after runtime allocation.");
    // Page-level readiness prevents native submits before React has attached its handlers.
    compiled.files["frontend/app/preview-location.jsx"] = `"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
export default function PreviewLocation() {
  const pathname = usePathname();
  useEffect(() => {
    const report = () => window.parent.postMessage({type:"levoks-preview-location",id:${JSON.stringify(id)},path:window.location.pathname + window.location.search + window.location.hash},${JSON.stringify(editorOrigin)});
    const requested = event => {if(event.source === window.parent && event.origin === ${JSON.stringify(editorOrigin)} && event.data?.type === "levoks-preview-location-request") report();};
    const loading = () => window.parent.postMessage({type:"levoks-preview-loading",id:${JSON.stringify(id)}},${JSON.stringify(editorOrigin)});
    report(); window.addEventListener("hashchange",report); window.addEventListener("popstate",report); window.addEventListener("message",requested); window.addEventListener("beforeunload",loading);
    return () => {window.removeEventListener("hashchange",report);window.removeEventListener("popstate",report);window.removeEventListener("message",requested);window.removeEventListener("beforeunload",loading);};
  }, [pathname]);
  return null;
}`;
    for (const [file, source] of Object.entries(compiled.files)) {
      if (!file.startsWith("frontend/app/") || !file.endsWith("/page.jsx"))
        continue;
      const declaration = /export default function ([A-Za-z_][A-Za-z0-9_]*)\(/;
      const component = source.match(declaration)?.[1];
      if (!component)
        throw new Error("Generated preview page has no supported entry point.");
      const relative = path.posix.relative(
        path.posix.dirname(file),
        "frontend/app/preview-location",
      );
      compiled.files[file] =
        source.replace(
          declaration,
          `import PreviewLocation from ${JSON.stringify(relative.startsWith(".") ? relative : "./" + relative)};\nfunction ${component}(`,
        ) +
        `\nexport default function PreviewPage(){return <><${component}/><PreviewLocation/></>;}`;
    }
    await mkdir(directory, { recursive: true });
    for (const [name, source] of Object.entries(compiled.files)) {
      if (!name.startsWith("backend/") && !name.startsWith("frontend/"))
        continue;
      const destination = path.join(directory, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(
        destination,
        name.endsWith("/server.js") && name.startsWith("backend/")
          ? source.replace(
              "app.listen(PORT, () =>",
              'app.listen(PORT, "127.0.0.1", () =>',
            )
          : source,
      );
    }
    const services = project.backend.services.map((service) => {
      const auth = service.blocks.find((block) => block.type === "auth_block");
      const setup = service.blocks.some(
        (block) =>
          block.type === "rest_endpoint" &&
          block.config.route.endsWith("/operator-setup"),
      );
      const account = Boolean(
        compiled.files[
          `frontend/app/%5F%5Flevoks/account/${serviceSlug(service.name)}/page.jsx`
        ],
      );
      return {
        id: service.id,
        name: service.name,
        slug: serviceSlug(service.name),
        port: service.port,
        connectionEnv: service.database?.connectionEnv || "MONGO_URI",
        identityId:
          auth?.type === "auth_block"
            ? auth.config.identityServiceId
            : undefined,
        setupCode: setup ? randomBytes(32).toString("hex") : undefined,
        account,
        notifications: service.blocks.some(
          (block) => block.type === "submission_notification",
        ),
      };
    });
    state.accounts = services
      .filter((service) => service.account)
      .map((service) => ({
        service: service.name,
        path: `/__levoks/account/${service.slug}`,
        setupCode: service.setupCode,
      }));
    state.inboxes = project.backend.services.flatMap((service) =>
      service.blocks
        .filter(
          (block) =>
            block.type === "rest_endpoint" &&
            block.config.view === "submissionInbox",
        )
        .map((block) => ({
          service: service.name,
          path: `/__levoks/inbox/${serviceSlug(service.name)}/${block.id}`,
        })),
    );
    await writeFile(
      path.join(directory, "runtime.json"),
      JSON.stringify({ id, origin, frontendPort, editorOrigin, services }),
    );
    const env = Object.fromEntries(
      [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "COMSPEC",
        "LEVOKS_PREVIEW_MONGO_BINARY_DIR",
      ].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
    );
    run.child = spawn(
      process.execPath,
      [path.resolve("scripts/preview-runtime.mjs"), directory],
      {
        env: { ...env, NODE_ENV: "test" },
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    run.child.on("message", (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const event = message as {
        type: string;
        message: string;
        emails: PreviewState["emails"];
      };
      if (event.type === "phase") run.state.message = event.message;
      if (event.type === "ready") {
        run.state.phase = "ready";
        run.state.message = "Local test runtime is ready.";
        run.state.origin = origin;
      }
      if (event.type === "emails") run.state.emails = event.emails;
      if (event.type === "failed") {
        run.state.phase = "failed";
        run.state.message = event.message;
      }
    });
    run.child.on("error", () => {
      run.state.phase = "failed";
      run.state.message =
        "Preview runner could not start. Check the local Node installation.";
    });
    run.child.on("exit", () => {
      if (!run.stopping && run.state.phase !== "failed") {
        run.state.phase = "failed";
        run.state.message =
          "Preview runtime stopped unexpectedly. Restart with a fresh test database.";
      }
    });
    return state;
  } catch (error) {
    await stopPreview(id, owner);
    throw error;
  }
}
