import { request as httpRequest } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { StoreHttpError } from './types';

export interface FetchResponse {
  status: number;
  finalUrl: string;
  text: string;
}

export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
) => Promise<FetchResponse>;

export function requestTimeoutMs(): number {
  const raw = Number(process.env.RETAIL_INTEL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1000 && raw <= 30000 ? Math.floor(raw) : 9000;
}

export function configuredProxy(): URL | null {
  const raw = process.env.RETAIL_INTEL_PROXY?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url;
  } catch {
    console.warn('[shopping] RETAIL_INTEL_PROXY is not a valid URL — direct connections will be used.');
    return null;
  }
}

export function configuredProxyHeader(): [string, string] | null {
  const raw = process.env.RETAIL_INTEL_PROXY_HEADER?.trim();
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx === -1) return null;
  const name = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  return name && value ? [name, value] : null;
}

export function storeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-IN,en;q=0.9,hi;q=0.8',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    ...extra,
  };
}

export const defaultFetcher: Fetcher = async (url, init = {}) => {
  const timeoutMs = init.timeoutMs ?? requestTimeoutMs();
  const proxy = configuredProxy();
  try {
    return proxy
      ? await proxiedFetch(url, init, proxy, timeoutMs)
      : await directFetch(url, init, timeoutMs);
  } catch (error) {
    if (error instanceof StoreHttpError) throw error;
    const timedOut = error instanceof Error && /aborted|timeout|timed out/i.test(error.message);
    throw new StoreHttpError(
      timedOut ? 'STORE_TIMEOUT' : 'STORE_UNAVAILABLE',
      `${timedOut ? 'request timed out' : 'request failed'} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
};

async function directFetch(url: string, init: { headers?: Record<string, string> }, timeoutMs: number): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: init.headers,
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await response.text();
    return { status: response.status, finalUrl: response.url || url, text };
  } finally {
    clearTimeout(timer);
  }
}

function readBody(
  response: NodeJS.ReadableStream,
  encoding: string | string[] | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const enc = Array.isArray(encoding) ? encoding[0] : encoding;
        if (enc?.includes('br')) return resolve(brotliDecompressSync(buffer).toString('utf8'));
        if (enc?.includes('gzip')) return resolve(gunzipSync(buffer).toString('utf8'));
        if (enc?.includes('deflate')) return resolve(inflateSync(buffer).toString('utf8'));
        resolve(buffer.toString('utf8'));
      } catch (error) {
        reject(error);
      }
    });
    response.on('error', reject);
  });
}

function openTunnel(target: URL, proxy: URL, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
    const plain = netConnect({ host: proxy.hostname, port: proxyPort, timeout: timeoutMs }, () => {
      const auth =
        proxy.username || proxy.password
          ? `Proxy-Authorization: Basic ${Buffer.from(
              `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
            ).toString('base64')}\r\n`
          : '';
      const custom = configuredProxyHeader();
      const extra = custom ? `${custom[0]}: ${custom[1]}\r\n` : '';
      plain.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n${auth}${extra}Connection: keep-alive\r\n\r\n`);
    });
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('latin1');
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      plain.off('data', onData);
      const statusLine = buffer.slice(0, buffer.indexOf('\r\n'));
      if (!/^HTTP\/1\.\d 200/.test(statusLine)) {
        plain.destroy();
        reject(new StoreHttpError('STORE_UNAVAILABLE', `proxy CONNECT failed: ${statusLine.trim()}`));
        return;
      }
      const tls = tlsConnect({ socket: plain, servername: target.hostname, ALPNProtocols: ['http/1.1'] }, () =>
        resolve(tls),
      );
      tls.once('error', reject);
    };
    plain.on('data', onData);
    plain.once('error', reject);
    plain.once('timeout', () => {
      plain.destroy();
      reject(new StoreHttpError('STORE_TIMEOUT', 'proxy CONNECT timed out'));
    });
  });
}

function proxiedFetch(
  url: string,
  init: { headers?: Record<string, string> },
  proxy: URL,
  timeoutMs: number,
  redirectsLeft = 3,
): Promise<FetchResponse> {
  return new Promise<FetchResponse>((resolve, reject) => {
    const target = new URL(url);
    const auth =
      proxy.username || proxy.password
        ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`
        : null;
    const timer = setTimeout(() => reject(new StoreHttpError('STORE_TIMEOUT', 'request timed out (proxy)')), timeoutMs);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    if (target.protocol === 'http:') {
      const options: RequestOptions = {
        host: proxy.hostname,
        port: Number(proxy.port) || 80,
        method: 'GET',
        path: url,
        headers: {
          host: target.host,
          ...(auth ? { 'proxy-authorization': auth } : {}),
          ...(() => {
            const custom = configuredProxyHeader();
            return custom ? { [custom[0].toLowerCase()]: custom[1] } : {};
          })(),
          ...init.headers,
        },
        timeout: timeoutMs,
      };
      const req = httpRequest(options, (res) => {
        readBody(res, res.headers['content-encoding']).then(
          (text) =>
            finish(() =>
              resolve({ status: res.statusCode ?? 0, finalUrl: url, text }),
            ),
          (error) => finish(() => reject(error)),
        );
      });
      req.once('error', (error) => finish(() => reject(error)));
      req.end();
      return;
    }

    openTunnel(target, proxy, timeoutMs).then(
      (socket) => {
        const options: RequestOptions = {
          host: target.hostname,
          method: 'GET',
          path: `${target.pathname}${target.search}`,
          headers: { host: target.host, 'accept-encoding': 'gzip, deflate, br', ...init.headers },
          createConnection: () => socket,
          agent: false,
          timeout: timeoutMs,
        };
        const req = httpsRequest(options, (res) => {
          readBody(res, res.headers['content-encoding']).then(
            (text) =>
              finish(() => {
                socket.end();
                const status = res.statusCode ?? 0;
                if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
                  const next = new URL(res.headers.location, url).toString();
                  resolve(proxiedFetch(next, init, proxy, timeoutMs, redirectsLeft - 1));
                  return;
                }
                resolve({ status, finalUrl: url, text });
              }),
            (error) =>
              finish(() => {
                socket.destroy();
                reject(error);
              }),
          );
        });
        req.once('error', (error) =>
          finish(() => {
            socket.destroy();
            reject(error);
          }),
        );
        req.end();
      },
      (error) => finish(() => reject(error)),
    );
  });
}

const BLOCK_MARKERS = [
  /enter the characters you see below/i,
  /api-services-support@amazon\.com/i,
  /sorry! we just need to make sure you're not a robot/i,
  /to discuss automated access to amazon data/i,
  /please verify (?:you are|you're) a human/i,
  /are you a human\?/i,
  /captcha/i,
  /access to this page has been denied/i,
  /unusual traffic from your computer network/i,
  /something went wrong on our end\. please try again/i,
];

const RATE_LIMIT_MARKERS = [/too many requests/i, /rate ?limit/i, /http error 429/i];

export function classifyResponse(status: number, text: string, finalUrl: string): void {
  if (status === 429) {
    throw new StoreHttpError('STORE_RATE_LIMITED', 'the store asked us to slow down (HTTP 429)');
  }
  if (status >= 500 && status !== 503) {
    throw new StoreHttpError('STORE_UNAVAILABLE', `store returned HTTP ${status}`);
  }
  if (status === 403 || status === 503) {
    throw new StoreHttpError('STORE_BLOCKED', `store refused the request (HTTP ${status}, likely WAF)`);
  }
  if (status === 404) {
    throw new StoreHttpError('INVALID_URL', `page not found (HTTP 404): ${finalUrl}`);
  }
  if (status !== 200) {
    throw new StoreHttpError('STORE_UNAVAILABLE', `unexpected HTTP ${status}`);
  }
  if (RATE_LIMIT_MARKERS.some((re) => re.test(text)) && text.length < 20000) {
    throw new StoreHttpError('STORE_RATE_LIMITED', 'the store applied a rate limit page');
  }
  const suspected = BLOCK_MARKERS.some((re) => re.test(text));
  if (suspected && text.length < 40000) {
    throw new StoreHttpError(
      'STORE_BLOCKED',
      'the store answered with a bot-check page (captcha/WAF) — configure RETAIL_INTEL_PROXY to route around it',
    );
  }
}
