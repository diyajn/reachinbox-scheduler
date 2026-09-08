import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@reachinbox.local" },
    update: {},
    create: { email: "demo@reachinbox.local", name: "Demo User" },
  });

  // Paste your real Ethereal credentials here (from https://ethereal.email)
  // after generating a test account, then re-run: npx ts-node prisma/seed.ts
  const sender = await prisma.sender.upsert({
    where: { id: "demo-sender-id" },
    update: {},
    create: {
      id: "demo-sender-id",
      userId: user.id,
      label: "Demo Sender",
      smtpUser: process.env.ETHEREAL_USER || "REPLACE_WITH_ETHEREAL_USER",
      smtpPass: process.env.ETHEREAL_PASS || "REPLACE_WITH_ETHEREAL_PASS",
    },
  });

  console.log("Seeded user:", user.id, "sender:", sender.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
