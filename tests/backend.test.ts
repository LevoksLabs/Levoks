import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext, Script } from "node:vm";
import { authController } from "../src/lib/codegen/auth";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useBackendStore } from "../src/store/backendStore";
import { compileProject } from "../src/lib/project/compiler";

class ResponseStub {
  code = 200;
  body: unknown;
  cookieOptions: Record<string, unknown> = {};
  status(code: number) {
    this.code = code;
    return this;
  }
  json(body: unknown) {
    this.body = body;
    return this;
  }
  cookie(_name: string, _value: string, options: Record<string, unknown>) {
    this.cookieOptions = options;
    return this;
  }
  end() {
    return this;
  }
}

test("identity controller hashes passwords, rejects privilege input, and sets HttpOnly cookies", async () => {
  const created: Record<string, unknown>[] = [];
  const user = {
    _id: "abc",
    email: "user@example.com",
    name: "User",
    password: "hashed",
  };
  const exported: Record<
    string,
    (
      request: { body: Record<string, unknown> },
      response: ResponseStub,
    ) => Promise<void>
  > = {};
  const dependencies: Record<string, unknown> = {
    "../models/User": {
      create: async (value: Record<string, unknown>) => {
        created.push(value);
        return user;
      },
      findOne: () => ({ select: async () => user }),
    },
    bcryptjs: {
      hashSync: () => "dummy",
      hash: async () => "hashed",
      compare: async (password: string) => password === "long-password-123",
    },
    jsonwebtoken: { sign: () => "signed-token" },
    "express-rate-limit": () => () => {},
    "../identity/sessions": {
      issue: async (
        _user: unknown,
        _request: unknown,
        response: ResponseStub,
      ) =>
        response.cookie("levoks_session", "fixture-session", {
          httpOnly: true,
          secure: true,
        }),
    },
  };
  runInNewContext(authController("User", 12), {
    exports: exported,
    require: (id: string) => dependencies[id],
    process: { env: { JWT_SECRET: "x".repeat(32), NODE_ENV: "production" } },
    Buffer,
  });
  const registration = new ResponseStub();
  await exported.register(
    {
      body: {
        email: "USER@example.com",
        name: "User",
        password: "long-password-123",
        role: "admin",
      },
    },
    registration,
  );
  assert.equal(registration.code, 201);
  assert.equal(created[0].password, "hashed");
  assert.equal(created[0].role, "user");
  assert.equal(created[0].email, "user@example.com");
  assert.doesNotMatch(JSON.stringify(registration.body), /password|hashed/);
  const denied = new ResponseStub();
  await exported.login(
    { body: { email: "user@example.com", password: "wrong" } },
    denied,
  );
  assert.equal(denied.code, 401);
  const loggedIn = new ResponseStub();
  await exported.login(
    { body: { email: "user@example.com", password: "long-password-123" } },
    loggedIn,
  );
  assert.equal(loggedIn.cookieOptions.httpOnly, true);
  assert.equal(loggedIn.cookieOptions.secure, true);
  assert.doesNotMatch(JSON.stringify(loggedIn.body), /signed-token|hashed/);
});

test("auth and CRUD templates emit syntactically valid backend modules", () => {
  const project = emptyProject();
  restoreProject(project);
  useBackendStore.getState().loadAuthTemplate();
  useBackendStore.getState().loadCrudTemplate();
  const output = compileProject(captureProject(project.id, project.name));
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  for (const [path, source] of Object.entries(output.files))
    if (path.startsWith("backend/") && path.endsWith(".js"))
      assert.doesNotThrow(() => new Script(source), path);
  assert.match(
    output.files["backend/auth-service/controllers/identity.js"],
    /bcrypt.hash/,
  );
  assert.match(
    output.files["backend/auth-service/models/User.js"],
    /select: false/,
  );
  assert.match(
    output.files["backend/auth-service/models/User.js"],
    /unique: true/,
  );
});

test("generated request validation rejects query operators and unknown privileged fields", () => {
  const project = emptyProject();
  restoreProject(project);
  useBackendStore.getState().loadCrudTemplate();
  const source = compileProject(captureProject(project.id, project.name)).files[
    "backend/crud-api/middleware/validate.js"
  ];
  type RequestStub = {
    method: string;
    body: Record<string, unknown>;
    params: Record<string, string>;
  };
  const exported: {
    validateBody?: (
      fields: { name: string; type: string; required: boolean }[],
    ) => (
      request: RequestStub,
      response: ResponseStub,
      next: () => void,
    ) => void;
  } = {};
  runInNewContext(source, { exports: exported });
  const validate = exported.validateBody!([
    { name: "title", type: "string", required: true },
  ]);
  const unsafe = new ResponseStub();
  let next = false;
  validate(
    {
      method: "POST",
      params: {},
      body: { title: "Hello", $set: { role: "admin" } },
    },
    unsafe,
    () => {
      next = true;
    },
  );
  assert.equal(unsafe.code, 400);
  assert.equal(next, false);
  const request = {
    method: "POST",
    params: {},
    body: { title: "Hello", role: "admin" },
  };
  validate(request, new ResponseStub(), () => {
    next = true;
  });
  assert.equal(next, true);
  assert.equal("role" in request.body, false);
});
