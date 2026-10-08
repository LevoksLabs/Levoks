import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { headerContractProblems } from "../src/lib/backend/header-contracts";
import { mappedLoginFixture } from "./helpers/mapped-login-fixture";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import type { SchemaField } from "../src/types/backend";
import { PROGRAM_RUNTIME } from "../src/lib/codegen/program-runtime";
import { block, programFixture } from "./helpers/program-fixture";

test("header contracts persist stable mappings and reject reserved, duplicate, structured and unmapped required headers", () => {
  const {project, endpointId} = mappedLoginFixture(true);
  const endpoint = project.backend.services[0].blocks.find(b => b.id === endpointId)!;
  if (endpoint.type !== "rest_endpoint") throw new Error("Endpoint");
  const initial = compileProject(parseProject(project));
  assert.deepEqual(initial.diagnostics.filter(d => d.severity === "error"), []);
  endpoint.config.requestHeaders![0].name = "X-App-Version";
  const renamed = compileProject(parseProject(project));
  const call = renamed.graph.flows[0].steps[0];
  assert.equal(call.type === "api_call" && call.requestMappings!.at(-1)!.name, "X-App-Version");
  for (const name of ["Authorization", "Cookie", "Content-Type", "Origin", "X-Forwarded-For", "X-Levoks-Session", "Sec-Fetch-Site", "Proxy-Authorization"]) {
    assert.ok(headerContractProblems([{name, type:"string", required:false}]).length, name);
  }
  assert.ok(headerContractProblems([{name:"X-App", type:"string", required:false}, {name:"x-app", type:"string", required:false}]).some(p => p.includes("repeated")));
  assert.ok(headerContractProblems([{name:"x-app", type:"object", required:false}]).length);
  assert.ok(headerContractProblems([{name:"x_app", type:"string", required:false}]).length);
  assert.ok(headerContractProblems(Array.from({length:33}, (_, i) => ({name:`x-app-${i}`,type:"string" as const,required:false}))).some(p => p.includes("32")));
  endpoint.config.requestHeaders![0].name = "Authorization";
  assert.ok(compileProject(project).diagnostics.some(d => d.severity === "error" && /managed by/.test(d.message)));
  endpoint.config.requestHeaders![0].name = "X-App-Version";
  project.routing.connections[0].requestMappings = undefined;
  assert.ok(compileProject(project).diagnostics.some(d => /Required header fields/.test(d.message)));
  project.routing.connections[0].requestMappings = initial.graph.flows[0].steps[0].type === "api_call" ? initial.graph.flows[0].steps[0].requestMappings : [];
  const metadata = {...programFixture(), id:"metadata", name:"Metadata", port:3002, blocks:[
    block("header_echo", "rest_endpoint", {route:"/api/header-echo",method:"GET",authRequired:false,requestHeaders:[{name:"X-App-Version",type:"number",required:true}]},["header_map","header_response"]),
    block("header_map", "transform", {fields:{version:"$request.headers.x_app_version"},output:"metadata"}),
    block("header_response", "response", {status:200,value:"$metadata"}),
  ]};
  project.backend.services.push(parseProject({...project,backend:{...project.backend,services:[...project.backend.services,metadata]}}).backend.services[1]);
  assert.deepEqual(compileProject(project).diagnostics.filter(d => d.severity === "error"), []);
  const mapping = project.backend.services[1].blocks.find(b=>b.id==="header_map")!;
  if(mapping.type!=="transform")throw new Error("Transform");
  mapping.config.fields.version="$request.headers.undeclared";
  assert.ok(compileProject(project).diagnostics.some(d => d.nodeId==="header_echo" && /Request Headers/.test(d.message)));
});

test("generated header validation isolates metadata, normalizes scalar bindings and rejects ambiguous or unsafe input", async () => {
  const { project } = mappedLoginFixture(true);
  const source = compileProject(project).files["backend/auth-service/middleware/validate.js"];
  const exports: Record<string, (contracts: unknown) => (req: unknown, res: unknown, next: () => void) => void> = {};
  runInNewContext(source, {exports});
  const fields: SchemaField[] = [
    {name:"X-App-Version",type:"number",required:true},
    {name:"X-App-Enabled",type:"boolean",required:true},
    {name:"X-App-Date",type:"date",required:true},
    {name:"X-App-Record",type:"objectId",required:true},
    {name:"X-App-Label",type:"string",required:false},
  ];
  const headers: Record<string, string> = {"x-app-version":"7", "x-app-enabled":"false", "x-app-date":"2026-10-08T00:00:00Z", "x-app-record":"0123456789abcdef01234567", authorization:"Bearer private"};
  const check = (input: Record<string, string | string[]>, rawHeaders?: string[]) => {
    const req = {headers: input, rawHeaders, levoksHeaders: undefined as unknown};
    let status = 200, called = false;
    const res = {status(value: number) {status=value; return this;}, json() {return this;}};
    exports.validateParameters({header: fields})(req, res, () => {called=true;});
    return {req, status, called};
  };
  const valid = check(headers);
  assert.equal(valid.called, true);
  assert.deepEqual(JSON.parse(JSON.stringify(valid.req.levoksHeaders)), {x_app_version:7,x_app_enabled:false,x_app_date:headers["x-app-date"],x_app_record:headers["x-app-record"]});
  assert.equal(valid.req.headers.authorization, "Bearer private");
  for (const value of ["no", "Infinity", ["7","8"]]) assert.equal(check({...headers,"x-app-version":value}).status,400);
  assert.equal(check({...headers,"x-app-label":"bad\r\nX-Test: injected"}).status,400);
  assert.equal(check({...headers,"x-app-label":"a".repeat(4097)}).status,400);
  assert.equal(check({...headers,"x-app-version":""}).status,400);
  assert.equal(check(headers, ["X-App-Version","7","x-app-version","8"]).status,400);

  const runtime: {createWorkflow?: (program: unknown, models: unknown, database: unknown) => (id: string, req: unknown) => Promise<{body: unknown}>} = {};
  runInNewContext(PROGRAM_RUNTIME, {exports:runtime});
  const execute = runtime.createWorkflow!({blocks: [
    {id:"entry",type:"rest_endpoint",config:{responseBody:[]},connections:["map","respond"]},
    {id:"map",type:"transform",config:{fields:{version:"$request.headers.x_app_version",private:"$request.headers.authorization"},output:"metadata"},connections:[]},
    {id:"respond",type:"response",config:{status:200,value:"$metadata"},connections:[]},
  ]}, {}, {});
  const result = await execute("entry", valid.req);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body)), {version:7});
});
