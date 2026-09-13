import type { PoolConfig } from 'pg';

function isLocalHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === '' ||
    h === 'localhost' ||
    h === '::1' ||
    h === '127.0.0.1' ||
    h.startsWith('127.') ||
    !h.includes('.') 
  );
}

export function resolvePgSsl(connectionString: string | undefined | null): PoolConfig['ssl'] {
  const url = (connectionString ?? '').trim();
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

export function sanitizeConnectionString(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

export function pgConnectionConfig(
  connectionString: string | undefined | null,
  overrides: Partial<PoolConfig> = {},
): PoolConfig {
  const raw = (connectionString ?? '').trim();
  return {
    connectionString: raw ? sanitizeConnectionString(raw) : undefined,
    connectionTimeoutMillis: 10_000,
    ssl: resolvePgSsl(raw),
    ...overrides,
  };
}

export function maskConnectionString(connectionString: string | undefined | null): string {
  const url = (connectionString ?? '').trim();
  if (!url) return '(unset)';
  try {
    const parsed = new URL(url);
    const user = parsed.username ? `${decodeURIComponent(parsed.username)}@` : '';
    return `${parsed.protocol}//${user}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(unparseable)';
  }
}
