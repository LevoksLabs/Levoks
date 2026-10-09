import { setTimeout } from "node:timers/promises";
import { getMongoClient } from "../src/lib/mongodb";
import {
  Deployments,
  processDeploymentJob,
} from "../src/lib/server/deployments";

async function main() {
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  const client = await getMongoClient();
  const db = client.db();
  const beat = () =>
    db
      .collection<{ _id: string; heartbeat: Date }>("levoks_workers")
      .updateOne(
        { _id: "deployment" },
        { $set: { heartbeat: new Date() } },
        { upsert: true },
      );
  const heartbeat = setInterval(() => {
    void beat().catch(() => {});
  }, 30_000);
  try {
    const store = new Deployments(db);
    await db
      .collection("levoks_deployments")
      .createIndex({ active: 1, "job.dueAt": 1 });
    console.info("Deployment worker ready.");
    while (!stopping) {
      try {
        await beat();
        await processDeploymentJob(store);
      } catch {
        console.error(
          "Deployment worker could not process a release. Check database and vault configuration.",
        );
      }
      if (!stopping) await setTimeout(2000);
    }
  } finally {
    clearInterval(heartbeat);
    await client.close();
  }
}
void main().catch(() => {
  console.error(
    "Deployment worker could not start. Check server configuration.",
  );
  process.exitCode = 1;
});
