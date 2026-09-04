/**
 * Durable backing for the support store.
 *
 * The store itself is synchronous and lives on `globalThis`. That is fine for one
 * long-lived Node process (`pnpm dev`, Docker) but not for serverless: on Vercel
 * each API route is an invocation that may land on a different (or cold) instance,
 * so a conversation created by `POST /api/conversations` or `/api/invite-agent`
 * was invisible to the next request — "Conversation not found" 404s, an empty
 * dashboard, and a chat that forgot the customer every turn.
 *
 * This module mirrors the store as a single JSON document in a backend shared by
 * all instances:
 *
 *  - `blob`  auto-selected when `BLOB_READ_WRITE_TOKEN` exists (Vercel dashboard →
 *            Storage → Create Database → Blob injects it for you). Written with
 *            `allowOverwrite`, read with `useCache: false` for a consistent read.
 *  - `file`  `NEXAVOICE_STORE=file` writes `.data/nexavoice-store.json` — shared
 *            state across processes on one machine (Docker, PM2).
 *  - `none`  in-memory only: local dev without a store, and the contract tests.
 *            Behaviour is exactly what it was before this module existed.
 *
 * `NEXAVOICE_STORE=memory|file|blob` overrides the auto-detection;
 * `NEXAVOICE_BLOB_ACCESS=public|private` pins the blob access mode (default: try
 * the mode matching the store, falling back to the other one once).
 *
 * Writes are last-writer-wins per conversation document (see `mergeRemote`).
 * That is correct for one customer + one human agent, and is the reason this stays
 * a mirror rather than a source of truth: swap in a real database by replacing
 * this module and nothing else in the app changes.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type PersistenceKind = 'none' | 'blob' | 'file';

export interface PersistenceBackend {
  kind: PersistenceKind;
  /** Human-readable location for logs and /api/health. Never contains credentials. */
  target: string;
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
}

const DEFAULT_BLOB_PATHNAME = 'nexavoice/support-store.json';
/**
 * Local state lives under `.data/` on purpose: a path that is only partly static
 * (`path.resolve(process.cwd(), process.env.X)`) makes Next.js trace — and deploy —
 * the whole project, which bloats and can fail a Vercel build.
 */
const STATE_DIR = '.data';
const DEFAULT_FILE_NAME = 'nexavoice-store.json';

type BlobAccess = 'public' | 'private';

function statePathname(): string {
  return (process.env.NEXAVOICE_STATE_PATHNAME?.trim() || DEFAULT_BLOB_PATHNAME).replace(/^\/+/, '');
}

function preferredAccess(): BlobAccess {
  return process.env.NEXAVOICE_BLOB_ACCESS?.trim().toLowerCase() === 'private' ? 'private' : 'public';
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Blob state resolved at runtime so switching stores never needs a redeploy. */
let blobAccess: BlobAccess | null = null;
let blobPublicUrl: string | null = null;

export function resetPersistenceRuntimeState(): void {
  blobAccess = null;
  blobPublicUrl = null;
}

/**
 * Picks the backend from env only — no I/O — so `/api/health` can report exactly
 * what the store will use, and tests can force `memory`.
 */
export function resolvePersistence(): PersistenceBackend {
  const forced = process.env.NEXAVOICE_STORE?.trim().toLowerCase();

  if (forced === 'memory') return noneBackend();
  if (forced === 'file') return fileBackend();
  if (forced === 'blob') return hasBlobToken() ? blobBackend() : unavailableBlobBackend();
  if (hasBlobToken()) return blobBackend();
  if (process.env.NEXAVOICE_STORE_FILE) return fileBackend();
  return noneBackend();
}

function noneBackend(): PersistenceBackend {
  return {
    kind: 'none',
    target: 'in-memory',
    async read() {
      return null;
    },
    async write() {},
  };
}

/** Configured for Blob but the token is missing: fail loudly instead of silently losing state. */
function unavailableBlobBackend(): PersistenceBackend {
  return {
    kind: 'none',
    target: 'blob (unconfigured: BLOB_READ_WRITE_TOKEN missing)',
    async read() {
      throw new Error('NEXAVOICE_STORE=blob requires BLOB_READ_WRITE_TOKEN');
    },
    async write() {
      throw new Error('NEXAVOICE_STORE=blob requires BLOB_READ_WRITE_TOKEN');
    },
  };
}

function fileBackend(): PersistenceBackend {
  // basename(): the configured name cannot escape STATE_DIR via `../`.
  const requested = process.env.NEXAVOICE_STORE_FILE?.trim();
  const file = path.join(
    process.cwd(),
    STATE_DIR,
    requested ? path.basename(requested) : DEFAULT_FILE_NAME,
  );
  return {
    kind: 'file',
    target: path.join(STATE_DIR, path.basename(file)),
    async read() {
      try {
        return await readFile(file, 'utf8');
      } catch {
        return null;
      }
    },
    async write(body) {
      await mkdir(path.dirname(file), { recursive: true });
      // Write to a temp file then rename: readers never observe a partial document.
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, body, 'utf8');
      await rename(tmp, file);
    },
  };
}

function blobBackend(): PersistenceBackend {
  const pathname = statePathname();
  return {
    kind: 'blob',
    target: `vercel-blob:${pathname}`,
    async read() {
      const { get } = await import('@vercel/blob');
      const access = blobAccess ?? preferredAccess();
      const target = access === 'public' ? await publicBlobUrl() : pathname;
      if (!target) return null;
      try {
        const result = await get(target, { access, useCache: false });
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        blobAccess = access;
        return await new Response(result.stream).text();
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async write(body) {
      const { put } = await import('@vercel/blob');
      const options = (access: BlobAccess) => ({
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
      });
      const access = blobAccess ?? preferredAccess();
      try {
        const blob = await put(pathname, body, options(access));
        blobAccess = access;
        blobPublicUrl = blob.url;
      } catch (error) {
        // Store access mode is fixed at creation; retry once with the other one.
        const other: BlobAccess = access === 'public' ? 'private' : 'public';
        if (blobAccess || !looksLikeAccessMismatch(error)) throw error;
        const blob = await put(pathname, body, options(other));
        blobAccess = other;
        blobPublicUrl = blob.url;
      }
    },
  };
}

/**
 * Public blobs are read by absolute URL, which includes a per-store host we do not
 * know at build time — resolve it once per process with `list()`.
 */
async function publicBlobUrl(): Promise<string | null> {
  if (blobPublicUrl) return blobPublicUrl;
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: statePathname().split('/')[0] });
    const match =
      blobs.find((blob) => blob.pathname.endsWith('support-store.json')) ??
      blobs.find((blob) => blob.pathname === statePathname()) ??
      blobs[0];
    blobPublicUrl = match?.url ?? null;
    return blobPublicUrl;
  } catch (error) {
    console.warn('[persist] could not locate the state blob:', message(error));
    return null;
  }
}

function looksLikeAccessMismatch(error: unknown): boolean {
  const text = message(error).toLowerCase();
  return (
    text.includes('access') ||
    text.includes('private') ||
    text.includes('public') ||
    text.includes('not allowed')
  );
}

function isNotFound(error: unknown): boolean {
  const text = message(error).toLowerCase();
  return text.includes('404') || text.includes('not found') || text.includes('no blob');
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
