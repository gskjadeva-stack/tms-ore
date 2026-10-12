// Shared Prisma client + secret guard for Vercel serverless functions.
// Serverless-safe: caches PrismaClient on globalThis across invocations.
// NEVER hardcode secrets here — DATABASE_URL / TOKEN_SECRET come from env.
// Lazy-require @prisma/client so syntax/static tests run without install.
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
  if (!globalForPrisma.__tmsPrisma) {
    globalForPrisma.__tmsPrisma = new (prismaClientClass())();
  }
  return globalForPrisma.__tmsPrisma;
}

function getTokenSecret() {
  const secret = (process.env.TOKEN_SECRET || '').trim();
  if (!secret) {
    throw new Error('TOKEN_SECRET is not set');
  }
  return secret;
}

function isProd() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

module.exports = { getPrisma, getTokenSecret, isProd };
