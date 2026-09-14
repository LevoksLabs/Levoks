import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";
import type { Mongoose } from "mongoose";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useBackendStore } from "../../src/store/backendStore";
import { compileProject } from "../../src/lib/project/compiler";

test(
  "generated recovery atomically queues encrypted mail, delivers over HTTP, consumes links once and revokes prior sessions",
  { timeout: 180000 },
  async () => {
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const environment = {
      NODE_ENV: "test",
      IDENTITY_EMAIL_KEYS: JSON.stringify({
        v1: randomBytes(32).toString("base64"),
      }),
      IDENTITY_EMAIL_ACTIVE_KEY: "v1",
      IDENTITY_EMAIL_FROM: "Identity <identity@example.test>",
      IDENTITY_PUBLIC_URL: "https://app.example.test/account",
      RESEND_API_KEY: "fixture-api-key",
    };
    const old = { ...process.env };
    Object.assign(process.env, environment);
    const delivered: { text: string; to: string[]; subject: string }[] = [];
    const keys: string[] = [];
    let rejectDelivery = false;
    const receiver = createServer(async (req, res) => {
      assert.equal(req.headers.authorization, "Bearer fixture-api-key");
      keys.push(String(req.headers["idempotency-key"]));
      let body = "";
      for await (const chunk of req) body += chunk;
      if (rejectDelivery) {
        res.writeHead(503).end();
        return;
      }
      delivered.push(JSON.parse(body));
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ id: "local-delivery" }));
    });
    await new Promise<void>((resolve) =>
      receiver.listen(0, "127.0.0.1", resolve),
    );
    process.env.IDENTITY_EMAIL_TEST_ENDPOINT = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/emails`;
    const project = emptyProject();
    restoreProject(project);
    useBackendStore.getState().loadAuthTemplate();
    const output = compileProject(captureProject(project.id, project.name));
    const root = path.resolve(".verification/runtime-test/recovery-runtime");
    for (const [file, source] of Object.entries(output.files))
      if (file.startsWith("backend/")) {
        const destination = path.join(root, file.slice(8));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }
    const requireGenerated = createRequire(
      path.join(root, "auth-service/server.js"),
    );
    const mongoose = requireGenerated("mongoose") as Mongoose;
    await mongoose.connect(mongo.getUri("recovery"));
    type Recovery = {
      request: (email: unknown, kind: string) => Promise<void>;
      consume: (
        token: string,
        kind: string,
        password?: string,
      ) => Promise<void>;
      processOne: () => Promise<boolean>;
    };
    const recovery = requireGenerated("./identity/recovery") as Recovery;
    const User = requireGenerated(
      "./models/User",
    ) as Mongoose["models"][string];
    const bcrypt = requireGenerated("bcryptjs") as {
      hash: (value: string, rounds: number) => Promise<string>;
      compare: (value: string, hash: string) => Promise<boolean>;
    };
    const tokenOf = (mail: { text: string }) =>
      new URLSearchParams(
        new URL(mail.text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1),
      ).get("token")!;
    try {
      await User.init();
      const user = await User.create({
        email: "alice@example.test",
        name: "Alice",
        password: await bcrypt.hash("original-password-123", 10),
        role: "user",
      });
      await recovery.request("nobody@example.test", "reset");
      assert.equal(await recovery.processOne(), false);
      await recovery.request("alice@example.test", "verify");
      const queued = await mongoose.connection
        .db!.collection("users")
        .findOne({ _id: user._id });
      assert.equal(queued?.authVerifyMail.status, "queued");
      assert.equal(queued?.authVerifyHash.length, 64);
      assert.doesNotMatch(
        JSON.stringify(queued),
        /https:\/\/app|mode=verify|Confirm your email/,
      );
      assert.equal(await recovery.processOne(), true);
      assert.equal(delivered.length, 1);
      assert.deepEqual(delivered[0].to, ["alice@example.test"]);
      const verifyToken = tokenOf(delivered[0]);
      await recovery.consume(verifyToken, "verify");
      await assert.rejects(
        recovery.consume(verifyToken, "verify"),
        /invalid or expired/,
      );
      assert.ok((await User.findById(user._id)).emailVerifiedAt);
      await recovery.request("alice@example.test", "reset");
      const resetBefore = await mongoose.connection
        .db!.collection("users")
        .findOne({ _id: user._id });
      await recovery.request("alice@example.test", "reset");
      assert.equal(
        (
          await mongoose.connection
            .db!.collection("users")
            .findOne({ _id: user._id })
        )?.authResetHash,
        resetBefore?.authResetHash,
        "repeated requests are throttled without rotating the pending link",
      );
      rejectDelivery = true;
      assert.equal(await recovery.processOne(), true);
      const failed = await mongoose.connection
        .db!.collection("users")
        .findOne({ _id: user._id });
      assert.equal(failed?.authResetMail.attempts, 1);
      assert.equal(failed?.authResetMail.status, "queued");
      assert.equal(
        await recovery.processOne(),
        false,
        "failed mail waits for its retry time",
      );
      await mongoose.connection
        .db!.collection("users")
        .updateOne(
          { _id: user._id },
          { $set: { "authResetMail.dueAt": new Date(0) } },
        );
      rejectDelivery = false;
      assert.equal(await recovery.processOne(), true);
      assert.equal(
        keys[1],
        keys[2],
        "retries use the same provider idempotency key",
      );
      const resetToken = tokenOf(delivered[1]);
      const afterDelivery = await mongoose.connection
        .db!.collection("users")
        .findOne({ _id: user._id });
      assert.equal(afterDelivery?.authResetMail.status, "sent");
      assert.equal(afterDelivery?.authResetMail.encrypted, undefined);
      await assert.rejects(
        recovery.consume(resetToken, "reset", "short"),
        /at least 12/,
      );
      await mongoose.connection
        .db!.collection<{
          _id: string;
          userId: unknown;
          authVersion: number;
          revokedAt: Date | null;
        }>("levoksidentitysessions")
        .insertOne({
          _id: "prior-session",
          userId: user._id,
          authVersion: 0,
          revokedAt: null,
        });
      const results = await Promise.allSettled([
        recovery.consume(resetToken, "reset", "new-password-456"),
        recovery.consume(resetToken, "reset", "new-password-456"),
      ]);
      assert.equal(
        results.filter((r) => r.status === "fulfilled").length,
        1,
        "one reset wins concurrent consumption",
      );
      const changed = await User.findById(user._id).select(
        "+password +authVersion",
      );
      assert.equal(
        await bcrypt.compare("new-password-456", changed.password),
        true,
      );
      assert.equal(changed.authVersion, 1);
      assert.ok(
        (
          await mongoose.connection
            .db!.collection("levoksidentitysessions")
            .findOne({ userId: user._id })
        )?.revokedAt,
      );
      await assert.rejects(
        recovery.consume(resetToken, "reset", "new-password-456"),
        /invalid or expired/,
      );
      await mongoose.connection
        .db!.collection("users")
        .updateOne(
          { _id: user._id },
          { $set: { authResetRequestedAt: new Date(0) } },
        );
      await recovery.request("alice@example.test", "reset");
      await mongoose.connection
        .db!.collection("users")
        .updateOne(
          { _id: user._id },
          { $set: { "authResetMail.tag": randomBytes(16).toString("base64") } },
        );
      const count = delivered.length;
      await recovery.processOne();
      assert.equal(
        delivered.length,
        count,
        "tampered encrypted mail is never sent",
      );
      await mongoose.connection.db!.collection("users").updateOne({_id: user._id}, {$set: {authResetExpiresAt: new Date(0)}});
      await recovery.processOne();
      const expired = await mongoose.connection.db!.collection("users").findOne({_id: user._id});
      assert.ok(expired, "outbox expiry never removes its account");
      assert.equal(expired.authResetHash, undefined);
      assert.equal(expired.authResetMail, undefined, "expired recovery ciphertext is erased");
    } finally {
      await mongoose.disconnect();
      await mongo.stop();
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
      for (const name of [
        ...Object.keys(environment),
        "IDENTITY_EMAIL_TEST_ENDPOINT",
      ]) {
        if (old[name] === undefined) delete process.env[name];
        else process.env[name] = old[name];
      }
    }
  },
);
