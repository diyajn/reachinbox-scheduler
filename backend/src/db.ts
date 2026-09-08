import { PrismaClient } from "@prisma/client";

// A single shared Prisma client for the whole app (both the API process and
// the worker process import this file, each gets its own instance because
// they run in separate node processes - that's fine, Prisma pools connections
// per-process).
export const prisma = new PrismaClient();
