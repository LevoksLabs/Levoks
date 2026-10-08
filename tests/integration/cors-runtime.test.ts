import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import {createRequire} from "node:module";
import {once} from "node:events";
import path from "node:path";
import {corsSource} from "../../src/lib/backend/cors";
import type {MiddlewareConfig} from "../../src/types/backend";

const config: MiddlewareConfig = {middlewareType:"cors",corsOrigins:"https://client.example.test",corsMethods:["GET","POST"],corsAllowedHeaders:["Content-Type","X-App-Version"],corsExposedHeaders:["X-App-Result"],corsCredentials:false,corsMaxAge:300};

test("generated CORS middleware executes real HTTP preflights, denies forbidden requests and preserves server clients", async () => {
  const require = createRequire(path.resolve(".verification/runtime-test/entry.cjs"));
  const express = require("express");
  const make = (value: MiddlewareConfig | undefined, env: Record<string,string> = {}) => {
    const runtimeModule = {exports:undefined as unknown};
    runInNewContext(corsSource(value,["X-App-Version"]),{require,module:runtimeModule,process:{env},URL});
    return runtimeModule.exports;
  };
  assert.throws(()=>make(config,{CORS_ORIGINS:"https://private:credential@example.test/path"}), /CORS_ORIGINS/);
  assert.throws(()=>make(config,{CORS_ORIGINS:"*"}), /CORS_ORIGINS/);
  const app = express(); let executed=0;
  app.use(make(config));
  app.all("/resource", (_req: unknown, res: {set(key:string,value:string):unknown;json(value:unknown):unknown})=>{executed++;res.set("X-App-Result","ok");res.json({ok:true});});
  const server = app.listen(0,"127.0.0.1");
  await once(server,"listening");
  const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const send = (method:string,headers:Record<string,string>)=>fetch(origin+"/resource",{method,headers});
  try {
    const allowed={Origin:"https://client.example.test"};
    const preflight=await send("OPTIONS",{...allowed,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type, X-App-Version"});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get("access-control-allow-origin"),allowed.Origin);
    assert.equal(preflight.headers.get("access-control-allow-methods"),"GET,POST");
    assert.equal(preflight.headers.get("access-control-allow-headers"),"content-type,x-app-version");
    assert.equal(preflight.headers.get("access-control-max-age"),"300");
    assert.equal(preflight.headers.get("access-control-allow-credentials"),null);
    assert.equal(executed,0);
    for(const headers of [ {...allowed,"Access-Control-Request-Method":"DELETE"}, {...allowed,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"X-Undeclared"}, {Origin:"https://other.test","Access-Control-Request-Method":"POST"} ])assert.equal((await send("OPTIONS",headers)).status,403);
    assert.equal((await send("DELETE",allowed)).status,403);
    assert.equal((await send("GET",{Origin:"null"})).status,403);
    assert.equal(executed,0);
    const result=await send("POST",allowed);
    assert.equal(result.status,200);
    assert.equal(result.headers.get("access-control-expose-headers"),"X-App-Result");
    assert.equal(result.headers.get("vary"),"Origin");
    assert.equal((await send("DELETE",{})).status,200);
    assert.equal(executed,2);
    const env = {CORS_ORIGINS:" https://override.example.test/ "};
    const middleware=make(undefined,env) as (req:unknown,res:unknown,next:()=>void)=>void;
    const headers:Record<string,string>={};
    const res={setHeader(name:string,value:string){headers[name.toLowerCase()]=value;},getHeader(name:string){return headers[name.toLowerCase()];},status(){return this;},json(){return this;}};
    middleware({method:"GET",headers:{origin:"https://override.example.test"}},res,()=>{});
    assert.equal(headers["access-control-allow-credentials"],"true");
    assert.equal(env.CORS_ORIGINS,"https://override.example.test");
  } finally {server.close(); await once(server,"close");}
});
