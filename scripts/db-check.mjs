import { existsSync } from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

if (existsSync('.env')) loadEnv({ path: '.env', override: false });
if (existsSync('.env.local')) loadEnv({ path: '.env.local', override: true });

function isLocalHost(host) {
  const h = String(host ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === '' || h === 'localhost' || h === '::1' || h === '127.0.0.1' || h.startsWith('127.') || !h.includes('.');
}

function resolvePgSsl(connectionString) {
  const url = String(connectionString ?? '').trim();
  if (!url) return undefined;
  let host = '';
  let sslmode = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    sslmode = (parsed.searchParams.get('sslmode') ?? '').trim().toLowerCase();
  } catch {
    return undefined;
  }
  if (sslmode === 'disable' || sslmode === 'allow') return false;
  if (sslmode === 'verify-full' || sslmode === 'verify-ca') return {};
  if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  return isLocalHost(host) ? undefined : { rejectUnauthorized: false };
}

function sanitizeConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function mask(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const user = parsed.username ? `${decodeURIComponent(parsed.username)}@` : '';
    return `${parsed.protocol}//${user}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(unparseable)';
  }
}

async function probeDns(host) {
  const records = await dns.lookup(host, { all: true });
  return records;
}

function probeTcp(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, error: `TCP connect to ${host}:${port} timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true });
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message, code: error.code });
    });
  });
}

function hintFor(error, { host, port, user }) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const lines = [`  error: ${message}${code ? ` (${code})` : ''}`];

  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || /network is unreachable/i.test(message)) {
    lines.push('  → The host is unreachable from this network.');
    lines.push('    Supabase `db.<ref>.supabase.co` is IPv6-only: from IPv4-only networks (most');
    lines.push('    offices, some ISPs, some serverless regions) use the pooler host instead:');
    lines.push('      DATABASE_URL=postgres://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true');
    lines.push('      DIRECT_URL=postgres://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require');
  } else if (code === 'ENOTFOUND' || /getaddrinfo/i.test(message)) {
    lines.push('  → DNS does not resolve this host. Check the hostname for typos, or the');
    lines.push('    project may be paused/deleted in the Supabase dashboard.');
  } else if (code === 'ETIMEDOUT' || /timed out/i.test(message)) {
    lines.push('  → TCP timed out: a firewall is dropping packets, or the project is paused.');
    lines.push('    Supabase pauses free projects after inactivity — unpause it in the dashboard.');
  } else if (code === 'ECONNREFUSED') {
    lines.push(`  → Nothing listens on ${host}:${port}. For local dev, start it first:`);
    lines.push('      pnpm dev:db   # PGlite on 127.0.0.1:5433');
  } else if (code === 'ECONNRESET' || /terminated unexpectedly|connection closed/i.test(message)) {
    lines.push('  → The server accepted TCP then dropped the connection during handshake.');
    lines.push('    Usual causes: TLS required but not negotiated (this repo now sets it');
    lines.push('    automatically — make sure you pulled the latest lib/pg-config.ts), a');
    lines.push('    firewall/egress proxy that only allows HTTP(S), or a paused project.');
  } else if (code === '28P01' || /password authentication failed/i.test(message)) {
    lines.push('  → Wrong password, or wrong username for this endpoint:');
    lines.push('    • pooler (6543/5432): user must be `postgres.<project-ref>`');
    lines.push('    • direct  (db.<ref>.supabase.co): user is `postgres`');
    lines.push(`    You are connecting as user "${user || '(none)'}". Reset the DB password in`);
    lines.push('    Supabase → Project Settings → Database if needed.');
  } else if (/tenant or user not found/i.test(message)) {
    lines.push('  → Supavisor pooler rejected the username. It must be the full');
    lines.push('    `postgres.<project-ref>` (e.g. `postgres.abcdefghijkl`), not `postgres`.');
  } else if (/self-signed certificate|unable to verify|certificate/i.test(message)) {
    lines.push('  → TLS verification failed. Keep `?sslmode=require` (not verify-full) in the');
    lines.push('    URL — the app encrypts without demanding a CA-signed chain — and make sure');
    lines.push('    no corporate proxy is intercepting the connection.');
  } else if (/database .* does not exist/i.test(message)) {
    lines.push('  → The database name in the URL path is wrong. Supabase uses `/postgres`.');
  } else {
    lines.push('  → Check the URL for typos (see the masked form above) and confirm the');
    lines.push('    project is unpaused and the password is current.');
  }
  return lines.join('\n');
}

async function checkOne(name, connectionString, { required }) {
  console.log(`\n── ${name} ${required ? '(required)' : '(optional, used by `pnpm db:push`)'} ──`);
  if (!connectionString?.trim()) {
    console.log(required ? '✖ not set — add it to .env.local (see env.local.example).' : '· not set — `pnpm db:push` will use DATABASE_URL.');
    return required ? false : true;
  }
  const raw = connectionString.trim();
  console.log(`  ${mask(raw)}`);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    console.log('✖ not a valid URL. Expected postgres://user:password@host:port/database?sslmode=require');
    return false;
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    console.log(`✖ protocol is "${parsed.protocol}" — expected postgres:// or postgresql://`);
    return false;
  }
  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);
  const user = decodeURIComponent(parsed.username);
  if (!host || !user) {
    console.log('✖ URL must include a user and a host: postgres://USER:PASSWORD@HOST:PORT/DATABASE');
    return false;
  }

  try {
    const records = await probeDns(host);
    console.log(`  ✔ DNS: ${records.map((r) => `${r.address} (IPv${r.family})`).join(', ')}`);
  } catch (error) {
    console.log('✖ DNS lookup failed.');
    console.log(hintFor(error, { host, port, user }));
    return false;
  }

  const tcp = await probeTcp(host, port);
  if (!tcp.ok) {
    console.log('✖ TCP connect failed.');
    console.log(hintFor({ message: tcp.error, code: tcp.code }, { host, port, user }));
    return false;
  }
  console.log('  ✔ TCP: connected');

  const client = new pg.Client({
    connectionString: sanitizeConnectionString(raw),
    connectionTimeoutMillis: 12000,
    ssl: resolvePgSsl(raw),
  });
  try {
    await client.connect();
    const version = await client.query('SHOW server_version');
    const tables = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    console.log(`  ✔ Postgres ${version.rows[0].server_version} — answered a query`);
    const n = tables.rows[0].n;
    if (n === 0) {
      console.log('  ! public schema has no tables yet — run `pnpm db:push && pnpm seed`.');
    } else {
      console.log(`  ✔ public schema has ${n} table(s)`);
    }
    try {
      const products = await client.query('SELECT COUNT(*)::int AS n FROM "Product"');
      console.log(`  ✔ catalogue: ${products.rows[0].n} Product row(s)`);
    } catch {
      console.log('  ! no Product table/rows — run `pnpm db:push && pnpm seed`.');
    }
    return true;
  } catch (error) {
    console.log('✖ Postgres handshake/query failed.');
    console.log(hintFor(error, { host, port, user }));
    return false;
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

const dbOk = await checkOne('DATABASE_URL', process.env.DATABASE_URL, { required: true });
await checkOne('DIRECT_URL', process.env.DIRECT_URL, { required: false });

console.log(dbOk ? '\n✔ DATABASE_URL works — the app can connect.' : '\n✖ DATABASE_URL is not working — fix the failure above, then re-run `pnpm db:check`.');
process.exit(dbOk ? 0 : 1);
