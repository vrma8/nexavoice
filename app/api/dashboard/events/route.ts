import { NextRequest } from 'next/server';
import { hydrateStore, listEvents, subscribe } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/events  (Server-Sent Events)
 * Pushes conversation events to the dashboard as they happen; the dashboard
 * re-fetches the snapshot on each event and also polls as a fallback.
 *
 * Two serverless realities shape this route:
 *  - Events only fire for mutations that happen *on this instance*, so the
 *    dashboard's 3s poll of /api/dashboard (which reads the durable mirror) stays
 *    the source of truth. SSE is a latency optimisation, never a requirement.
 *  - A never-ending stream occupies a function for its whole lifetime and is
 *    billed for it, so the stream closes after SSE_MAX_LIFE_MS and the browser's
 *    EventSource reconnects on its own.
 */
const SSE_MAX_LIFE_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0) || 0;

  // Best-effort: never let a slow durable read delay the stream opening.
  await hydrateStore().catch(() => {});

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream closed
        }
      };
      send('ready', { now: Date.now(), backlog: listEvents(since).slice(-50) });
      const unsubscribe = subscribe((event) => send('conversation', event));
      const heartbeat = setInterval(() => send('ping', { now: Date.now() }), 20000);
      const close = () => {
        clearInterval(heartbeat);
        clearTimeout(hangUp);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      const hangUp = setTimeout(close, SSE_MAX_LIFE_MS);
      request.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Vercel/Cloudflare buffers responses unless this is set.
      'X-Accel-Buffering': 'no',
    },
  });
}
