// Shared Prisma client for the Express server (Render + local).
// Serverless-safe pattern reused for the long-lived server: caches on
// globalThis. Lazy-require keeps `node --check` green without install.
// NEVER hardcode secrets — DATABASE_URL comes from env only.
let PrismaClientRef = null;
function prismaClientClass() {
  if (!PrismaClientRef) {
    PrismaClientRef = require('@prisma/client').PrismaClient;
  }
  return PrismaClientRef;
}

const globalForPrisma = globalThis;

function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!globalForPrisma.__tmsServerPrisma) {
    globalForPrisma.__tmsServerPrisma = new (prismaClientClass())();
  }
  return globalForPrisma.__tmsServerPrisma;
}

module.exports = { getPrisma };
