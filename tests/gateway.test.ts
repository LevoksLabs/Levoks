import test from "node:test";
import assert from "node:assert/strict";
import { validateFiles } from "../src/lib/codegen/files";
import { compileProject } from "../src/lib/project/compiler";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useBackendStore } from "../src/store/backendStore";
import { createServer } from "node:http";
import { gatewaySource } from "../src/lib/codegen/gateway";
import { mappedLoginFixture } from "./helpers/mapped-login-fixture";

test("generated gateway forwards declared application headers only to their matching endpoint", async () => {
  const {project} = mappedLoginFixture(true);
  const received: Record<string, string | string[] | undefined>[] = [];
  let outputValue = "ok";
  const server = createServer((req, res) => {received.push(req.headers); res.writeHead(200,{"Content-Type":"application/json", "X-App-Result":outputValue,"X-App-Undeclared":"private","Cache-Control":"public, max-age=9999"}).end('{"ok":true}');});
  await new Promise<void>(r => server.listen(0,"127.0.0.1",r));
  const previous = process.env.API_ORIGIN_3001;
  process.env.API_ORIGIN_3001 = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    const gateway = await import("data:text/javascript;base64," + Buffer.from(gatewaySource(project.backend.services)).toString("base64"));
    const send = (route: string, extra: Record<string,string> = {}) => gateway.POST(new Request(`https://frontend.test/__levoks/api/3001/api/auth/${route}`, {method:"POST",headers:{origin:"https://frontend.test","Content-Type":"application/json","X-App-Version":"7","X-App-Undeclared":"private","X-Forwarded-For":"forged",...extra},body:"{}"}),{params:Promise.resolve({service:"3001",path:["api","auth",route]})});
    const login = await send("login");
    assert.equal(login.status,200);
    assert.equal(login.headers.get("x-app-result"),"ok");
    assert.equal(login.headers.get("x-app-undeclared"),null);
    assert.equal(login.headers.get("cache-control"),"private, no-store");
    assert.equal(received[0]["x-app-version"],"7");
    assert.equal(received[0]["x-app-undeclared"],undefined);
    assert.equal(received[0]["x-forwarded-for"],undefined);
    const register = await send("register");
    assert.equal(register.status,200);
    assert.equal(register.headers.get("x-app-result"),null);
    assert.equal(received[1]["x-app-version"],undefined);
    assert.equal((await send("login",{"X-App-Version":"x".repeat(4097)})).status,400);
    assert.equal((await send("login",{origin:"https://other.test"})).status,403);
    assert.equal(received.length,2);
    outputValue = "a".repeat(4097);
    assert.equal((await send("login")).status,502);
  } finally {
    if(previous===undefined) delete process.env.API_ORIGIN_3001; else process.env.API_ORIGIN_3001=previous;
    await new Promise<void>(r => server.close(()=>r()));
  }
});
test("Next encoded-underscore routes are exportable while encoded traversal and private environment files remain rejected", () => {
  const safe = {
    "frontend/app/%5F%5Flevoks/api/[service]/[...path]/route.js":
      "export const GET = () => Response.json({ok:true});",
  };
  assert.deepEqual(validateFiles(safe), safe);
  for (const file of [
    "frontend/%2e%2e/private.js",
    "frontend/%2fprivate.js",
    "frontend/.env.local",
    "frontend/%00.js",
    "../escaped.js",
  ])
    assert.throws(() => validateFiles({ [file]: "secret" }), /Unsafe/);
});
test("generated gateway forwards only the destination identity cookies and rejects unrelated upstream cookie writes", async () => {
  const p = emptyProject();
  restoreProject(p);
  useBackendStore.getState().loadAuthTemplate();
  const services = captureProject(p.id, p.name).backend.services;
  let received = "";
  const server = createServer((req, res) => {
    received = req.headers.cookie || "";
    res
      .writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": [
          "levoks_session_3001=renewed; HttpOnly",
          "levoks_session_3002=overwrite",
          "editor_session=overwrite",
        ],
      })
      .end('{"ok":true}');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const old = process.env.API_ORIGIN_3001;
  process.env.API_ORIGIN_3001 = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const gateway = await import(
      "data:text/javascript;base64," +
        Buffer.from(gatewaySource(services)).toString("base64")
    );
    const response = (await gateway.GET(
      new Request("https://frontend.test/__levoks/api/3001/api/auth/profile", {
        headers: {
          cookie:
            "editor_session=private; levoks_session_3001=access; levoks_refresh_3001=refresh; levoks_session_3002=other",
        },
      }),
      {
        params: Promise.resolve({
          service: "3001",
          path: ["api", "auth", "profile"],
        }),
      },
    )) as Response;
    assert.equal(response.status, 200);
    assert.equal(
      received,
      "levoks_session_3001=access; levoks_refresh_3001=refresh",
    );
    assert.deepEqual(response.headers.getSetCookie(), [
      "levoks_session_3001=renewed; HttpOnly",
    ]);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    if (old === undefined) delete process.env.API_ORIGIN_3001;
    else process.env.API_ORIGIN_3001 = old;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("identity account UI and gateway are emitted from the auth template and reserved routes cannot collide with canvas pages", () => {
  const p = emptyProject();
  restoreProject(p);
  useBackendStore.getState().loadAuthTemplate();
  const project = captureProject(p.id, p.name),
    output = compileProject(project);
  assert.ok(
    output.files["frontend/app/%5F%5Flevoks/account/auth-service/page.jsx"],
  );
  assert.ok(
    output.files["frontend/app/%5F%5Flevoks/api/[service]/[...path]/route.js"],
  );
  assert.match(output.files["frontend/lib/api.js"], /navigator.locks/);
  assert.match(output.files["frontend/.env.example"], /API_ORIGIN_3001/);
  const collision = structuredClone(project);
  collision.editor.pages.push({
    ...collision.editor.pages[0],
    id: "reserved-page",
    title: "Collision",
    route: "/__levoks/account/auth-service",
  });
  collision.editor.pageElementMap["reserved-page"] = [];
  assert.ok(
    compileProject(collision).diagnostics.some(
      (d) => d.severity === "error" && d.message.includes("reserved"),
    ),
  );
  const endpoint = project.backend.services[0].blocks.find(
    (b) => b.type === "rest_endpoint",
  )!;
  endpoint.connections = [project.backend.services[0].blocks[0].id];
  assert.ok(
    compileProject(project).diagnostics.some((d) =>
      d.message.includes("bypass password hashing"),
    ),
  );
});
