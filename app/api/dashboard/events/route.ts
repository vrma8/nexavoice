import { NextRequest } from 'next/server';
import { listEvents, subscribe } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/events  (Server-Sent Events)
 * Pushes conversation events to the dashboard as they happen; the dashboard
 * re-fetches the snapshot on each event and also polls as a fallback.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0) || 0;

  const stream = new ReadableStream({
    start(controller) {
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
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
