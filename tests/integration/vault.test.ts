import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { MongoVault } from "../../src/lib/server/vault";

test("durable vault encrypts, isolates identities/projects, detects tampering and rotates keys without exposing values",{timeout:180000},async()=>{
  const server=await MongoMemoryServer.create({binary:{downloadDir:path.resolve(".verification/mongodb-bin")},instance:{ip:"127.0.0.1"}});
  const client=await MongoClient.connect(server.getUri());
  try {
    const db=client.db("vault_test");
    const oldKey=randomBytes(32),newKey=randomBytes(32);
    const vault=new MongoVault(db,{active:"v1",keys:{v1:oldKey}});
    const secret="test-provider-credential";
    const created=await vault.put("alice","project_a","API_KEY",secret,0);
    assert.equal(created.version,1);
    assert.doesNotMatch(JSON.stringify(await db.collection("levoks_secrets").find({}).toArray()),new RegExp(secret));
    assert.equal(await vault.resolve("alice","project_a","API_KEY"),secret);
    assert.deepEqual(await vault.list("bob","project_a"),[]);
    assert.deepEqual(await vault.list("alice","project_b"),[]);
    await assert.rejects(vault.resolve("bob","project_a","API_KEY"),/does not exist/);
    await assert.rejects(vault.put("alice","project_a","API_KEY","overwrite",0),/changed/);
    const rotated=new MongoVault(db,{active:"v2",keys:{v1:oldKey,v2:newKey}});
    const second=await rotated.rotate("alice","project_a","API_KEY",1);
    assert.equal(second.keyId,"v2");
    assert.equal(await new MongoVault(db,{active:"v2",keys:{v2:newKey}}).resolve("alice","project_a","API_KEY"),secret);
    assert.doesNotMatch(JSON.stringify(await rotated.list("alice","project_a")),/encrypted|nonce|tag|test-provider/);
    await db.collection("levoks_secrets").updateOne({name:"API_KEY"},{$set:{tag:randomBytes(16).toString("base64")}});
    await assert.rejects(rotated.resolve("alice","project_a","API_KEY"),/could not be decrypted/);
    await assert.rejects(rotated.remove("alice","project_a","API_KEY",1),/changed/);
    await rotated.remove("alice","project_a","API_KEY",2);
    assert.deepEqual(await rotated.list("alice","project_a"),[]);
  }finally{await client.close();await server.stop();}
});
