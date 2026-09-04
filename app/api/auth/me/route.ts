import { NextRequest, NextResponse } from 'next/server';
import { hasDatabaseUrl } from '@/lib/db';
import { getAgent, getClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me?role=client|agent&id=…
 * Re-reads a stored login identity from the database so pages can display the
 * record exactly as it is maintained in PostgreSQL.
 */
export async function GET(request: NextRequest) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }
  const role = request.nextUrl.searchParams.get('role')?.toLowerCase();
  const id = request.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    if (role === 'agent') {
      const agent = await getAgent(id);
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      return NextResponse.json({ agent });
    }
    if (role === 'client') {
      const client = await getClient(id);
      if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      return NextResponse.json({ client });
    }
    return NextResponse.json({ error: "role must be 'client' or 'agent'" }, { status: 400 });
  } catch (error) {
    console.error('[auth] me failed:', error);
    return NextResponse.json({ error: 'Could not read the login record.' }, { status: 500 });
  }
}
