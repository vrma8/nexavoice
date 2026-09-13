export const DEFAULT_AGENT_UID = 123456;

export const DEFAULT_HUMAN_UID = 654321;

export function resolveAppId(fromServer?: string | null): string | null {
  const serverSide = fromServer?.trim();
  if (serverSide) return serverSide;
  const inlined = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim();
  return inlined || null;
}

export const MISSING_APP_ID_MESSAGE =
  'Agora App ID is not available in the browser. Set NEXT_PUBLIC_AGORA_APP_ID for both Build and Runtime environments in Vercel → Project Settings → Environment Variables, redeploy, and check /api/health.';
