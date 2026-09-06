/** RTC uid of the Conversational AI agent — shared by server routes and the client. */
export const DEFAULT_AGENT_UID = 123456;

/** RTC uid used by the human support agent when joining a customer's voice channel. */
export const DEFAULT_HUMAN_UID = 654321;

/**
 * Resolves the Agora App ID for browser code.
 *
 * Preference order matters: a value served by an API route is read at *runtime*,
 * while `process.env.NEXT_PUBLIC_*` in a client component is substituted at *build*
 * time. On Vercel an App ID that exists in the Runtime environment but was not
 * present for the Build environment still makes every API route work and leaves the
 * browser bundle with `undefined` — the RTC join then fails silently, which looks
 * like "the agent never connects".
 */
export function resolveAppId(fromServer?: string | null): string | null {
  const serverSide = fromServer?.trim();
  if (serverSide) return serverSide;
  const inlined = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim();
  return inlined || null;
}

/** Message shown when no App ID reached the browser at all. */
export const MISSING_APP_ID_MESSAGE =
  'Agora App ID is not available in the browser. Set NEXT_PUBLIC_AGORA_APP_ID for both Build and Runtime environments in Vercel → Project Settings → Environment Variables, redeploy, and check /api/health.';
