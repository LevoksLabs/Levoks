import { setTimeout } from "node:timers/promises";
import { getMongoClient } from "../src/lib/mongodb";
import {
  GitHubConnections,
  processGitHubJob,
} from "../src/lib/server/github-connections";

async function main() {
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  const client = await getMongoClient();
  try {
    const db = client.db();
    const store = new GitHubConnections(db);
    const heartbeat = setInterval(() => {
      void db
        .collection<{ _id: string; heartbeat: Date }>("levoks_workers")
        .updateOne(
          { _id: "github" },
          { $set: { heartbeat: new Date() } },
          { upsert: true },
        )
        .catch(() => {});
    }, 30_000);
    await db
      .collection("levoks_github_connections")
      .createIndex({ status: 1, dueAt: 1 });
    console.info("GitHub synchronization worker ready.");
    try {
      while (!stopping) {
        try {
          await db
            .collection<{ _id: string; heartbeat: Date }>("levoks_workers")
            .updateOne(
              { _id: "github" },
              { $set: { heartbeat: new Date() } },
              { upsert: true },
            );
          await store.enqueueCloudSaves();
          if (!(await processGitHubJob(store))) await setTimeout(2000);
        } catch {
          console.error(
            "Worker storage operation failed; retrying in 10 seconds.",
          );
          await setTimeout(10000);
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    await client.close();
  }
}
void main().catch(() => {
  console.error(
    "Worker startup failed. Configure MONGODB_URI and the server vault keyring.",
  );
  process.exitCode = 1;
});
