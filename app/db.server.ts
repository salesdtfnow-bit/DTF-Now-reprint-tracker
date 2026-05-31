import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Prisma Postgres connects through Accelerate, so the client is extended with
// withAccelerate(). DATABASE_URL is the prisma+postgres:// URL Vercel injected.
const prismaClientSingleton = () => new PrismaClient().$extends(withAccelerate());

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
export default prisma;
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
