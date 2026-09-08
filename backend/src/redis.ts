import { Redis } from "ioredis";
import * as dotenv from "dotenv";
dotenv.config();

// BullMQ requires maxRetriesPerRequest: null on the connection it's given.
export const redisConnection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});
