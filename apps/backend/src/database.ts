import { MongoClient } from "mongodb";

export const mongoClient = new MongoClient(
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/oathkeeper",
  { serverSelectionTimeoutMS: 3_000, connectTimeoutMS: 3_000 },
);

export const database = mongoClient.db();

export async function pingDatabase() {
  await database.command({ ping: 1 }, { timeoutMS: 3_000 });
}

export async function connectDatabase() {
  try {
    await mongoClient.connect();
    await pingDatabase();
  } catch (error) {
    await mongoClient.close();
    throw error;
  }
}
