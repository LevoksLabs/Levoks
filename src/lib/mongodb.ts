import { MongoClient } from "mongodb";
const globalMongo = globalThis as typeof globalThis & {
  levoksMongo?: Promise<MongoClient>;
};
/** Connect on demand so local editing and builds do not require cloud credentials. */
export function getMongoClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI)
    throw new Error("Cloud storage requires MONGODB_URI.");
  if (!globalMongo.levoksMongo)
    globalMongo.levoksMongo = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    })
      .connect()
      .catch((error) => {
        globalMongo.levoksMongo = undefined;
        throw error;
      });
  return globalMongo.levoksMongo;
}
