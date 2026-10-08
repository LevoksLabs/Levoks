import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { corsProblems } from "../src/lib/backend/cors";
import { block, programFixture } from "./helpers/program-fixture";
import { emptyProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import type { MiddlewareConfig } from "../src/types/backend";

const config: MiddlewareConfig = {middlewareType:"cors",corsOrigins:"https://client.example.test",corsMethods:["GET","POST"],corsAllowedHeaders:["Content-Type","X-App-Version"],corsExposedHeaders:["X-App-Result"],corsCredentials:false,corsMaxAge:300};

test("CORS settings persist, emit middleware and reject ambiguous or unsafe configuration", () => {
  const initial = emptyProject();
  const service = programFixture();
  service.blocks.push(block("cors","middleware",config));
  const project = parseProject({...initial,backend:{...initial.backend,services:[service]}});
  assert.deepEqual(project.backend.services[0].blocks.at(-1)!.config, {...service.blocks.at(-1)!.config});
  const output = compileProject(project);
  assert.deepEqual(output.diagnostics.filter(d=>d.severity==="error"),[]);
  new Script(output.files["backend/workflow-service/middleware/cors.js"]);
  assert.match(output.files["backend/workflow-service/server.js"], /require\('\.\/middleware\/cors'\)/);
  assert.match(output.files["backend/workflow-service/middleware/cors.js"], /"credentials":false/);
  for(const origins of ["*","null","https://user:password@example.test","https://example.test/path","not a URL",""])assert.ok(corsProblems({...config,corsOrigins:origins}).length);
  assert.ok(corsProblems({...config,corsMethods:[]}).length);
  assert.ok(corsProblems({...config,corsMethods:["GET","GET"]}).length);
  assert.deepEqual(corsProblems({...config,corsOrigins:"https://CLIENT.example.test:443/, http://[::1]:3000"}),[]);
  assert.ok(corsProblems({...config,corsAllowedHeaders:["X-App","x-app"]}).length);
  assert.ok(corsProblems({...config,corsExposedHeaders:["Set-Cookie"]}).length);
  assert.throws(()=>parseProject({...project,backend:{...project.backend,services:[{...service,blocks:[block("cors","middleware",{...config,corsMaxAge:86401})]}]}}));
  service.blocks.push(block("cors_two","middleware",config));
  assert.ok(compileProject(parseProject({...initial,backend:{...initial.backend,services:[service]}})).diagnostics.some(d=>d.message.includes("one CORS block")));
});

