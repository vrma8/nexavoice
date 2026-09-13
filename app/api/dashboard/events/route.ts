import { NextRequest } from 'next/server';
import { hydrateStore, listEvents, subscribe } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

const SSE_MAX_LIFE_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0) || 0;

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
      'X-Accel-Buffering': 'no',
    },
  });
}
