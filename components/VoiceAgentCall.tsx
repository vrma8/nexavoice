"use client";

import { useState, useRef, Suspense, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { RTMClient } from "agora-rtm";
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
  StopConversationRequest,
} from "@/types/conversation";
import { mirrorVoiceState } from "@/lib/api";
import { MISSING_APP_ID_MESSAGE, resolveAppId } from "@/lib/agora";
import { getClientSession } from "@/lib/session";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Phone, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

// Dynamically import the ConversationComponent with SSR disabled
const ConversationComponent = dynamic(() => import("./ConversationComponent"), {
  ssr: false,
});

// Dynamically import AgoraRTCProvider (browser-only)
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import("agora-rtc-react");
    return {
      default: function AgoraProviders({
        children,
      }: {
        children: React.ReactNode;
      }) {
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: "rtc",
            codec: "vp8",
          });
        }
        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false }
);

/** Why the AI agent could not be invited, shown verbatim instead of a generic banner. */
interface AgentJoinError {
  message: string;
  hint?: string;
}

/**
 * Reads a JSON error body from one of this app's API routes. Route handlers return
 * `{ error, hint }`, and those two fields are the difference between "Failed to
 * start call" and an actionable message when a deployment is misconfigured.
 */
async function readErrorBody(
  response: Response
): Promise<{ message: string; hint?: string }> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string; details?: string; hint?: string }
    | null;
  const message =
    body?.error ??
    body?.details ??
    `Request failed with status ${response.status}`;
  return { message, hint: body?.hint };
}

export default function VoiceAgentCall() {
  const router = useRouter();
  const [showConversation, setShowConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState<AgentJoinError | null>(null);

  // Preload heavy modules on mount
  useEffect(() => {
    import("agora-rtc-react").catch(() => {});
    import("agora-rtm").catch(() => {});
  }, []);

  const handleStartCall = async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(null);
    // Held in a local, not state: React has not applied setState by the time the
    // catch below runs, so reading state here would always see the previous value.
    let rtmFailure: string | null = null;

    try {
      // 1. Fetch RTC token + channel (and the App ID, so the browser never depends
      //    on a build-time-inlined NEXT_PUBLIC_AGORA_APP_ID).
      const agoraResponse = await fetch("/api/generate-agora-token");
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok) {
        const detail = await readErrorBody(agoraResponse);
        throw new Error(detail.hint ? `${detail.message} ${detail.hint}` : detail.message);
      }

      const appId = resolveAppId(responseData.appId);
      if (!appId) {
        throw new Error(MISSING_APP_ID_MESSAGE);
      }

      // 2. Run agent invite and RTM setup in parallel
      const session = getClientSession();
      const [agentData, rtm] = await Promise.all([
        // 2a. Start the AI agent
        fetch("/api/invite-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            customer_name: session?.name,
            customer_phone: session?.phone,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) {
              const detail = await readErrorBody(res);
              console.error("[voice] invite-agent failed:", detail.message);
              setAgentJoinError({ message: detail.message, hint: detail.hint });
              return null;
            }
            return res.json() as Promise<AgentResponse>;
          })
          .catch((err) => {
            console.error("Failed to start conversation with agent:", err);
            setAgentJoinError({
              message:
                err instanceof Error ? err.message : "Could not reach /api/invite-agent.",
            });
            return null;
          }),

        // 2b. Set up RTM
        (async () => {
          const { default: AgoraRTM } = await import("agora-rtm");
          const rtm: RTMClient = new AgoraRTM.RTM(appId, responseData.uid);
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          return rtm;
        })().catch((err) => {
          // Transcripts and agent state ride on RTM, but a failed login must not
          // abort the call — audio still works, and the UI is told why it is quiet.
          const message = err instanceof Error ? err.message : String(err);
          console.error("[voice] RTM setup failed:", message);
          rtmFailure = message;
          return null;
        }),
      ]);

      if (!rtm) {
        throw new Error(
          `Could not open the Agora RTM channel that carries transcripts and agent state${
            rtmFailure ? `: ${rtmFailure}` : "."
          } Check that the App ID and certificate belong to the same Agora project, and that RTM is enabled for it.`,
        );
      }

      setRtmClient(rtm);
      setAgoraData({
        ...responseData,
        appId,
        agentId: agentData?.agent_id,
        conversationId: agentData?.conversation_id,
      });
      setShowConversation(true);
    } catch (err) {
      // The previous copy blamed the microphone for every failure, which sent
      // people hunting for a permission problem when the real one was server-side.
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /permission|denied|notallowed|getUserMedia|device/i.test(message)
          ? "Microphone access is blocked. Allow the microphone for this site, then try again."
          : message,
      );
      console.error("Error starting voice call:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      const channel = agoraData?.channel;
      if (!channel) throw new Error("Missing channel for token renewal");

      const [rtcResponse, rtmResponse] = await Promise.all([
        fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`),
        fetch(`/api/generate-agora-token?channel=${channel}&uid=${agoraData.uid}`),
      ]);
      const [rtcData, rtmData] = await Promise.all([
        rtcResponse.json(),
        rtmResponse.json(),
      ]);

      if (!rtcResponse.ok || !rtmResponse.ok) {
        throw new Error("Failed to generate renewal tokens");
      }

      return { rtcToken: rtcData.token, rtmToken: rtmData.token };
    },
    [agoraData]
  );

  const handleEndConversation = async () => {
    if (agoraData?.agentId) {
      try {
        await fetch("/api/stop-conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: agoraData.agentId,
            conversation_id: agoraData.conversationId,
          } as StopConversationRequest),
        });
      } catch (error) {
        console.error("Error stopping agent:", error);
      }
    } else if (agoraData?.conversationId) {
      await mirrorVoiceState(agoraData.conversationId, { close: true });
    }

    rtmClient?.logout().catch((err) => console.error("RTM logout error:", err));
    setRtmClient(null);
    setShowConversation(false);
    router.push("/client");
  };

  if (showConversation && agoraData && rtmClient) {
    return (
      <div className="flex flex-col h-full absolute inset-0">
        {agentJoinError && (
          <div
            className="p-3 bg-red-900/30 text-red-300 text-sm text-center space-y-1"
            role="alert"
          >
            <div className="font-medium text-red-200">
              The AI agent could not join this call: {agentJoinError.message}
            </div>
            {agentJoinError.hint && (
              <div className="text-xs text-red-300/80">{agentJoinError.hint}</div>
            )}
            <div className="text-xs text-zinc-400">
              Deployment self-check:{" "}
              <a href="/api/health" target="_blank" rel="noreferrer" className="underline">
                /api/health
              </a>{" "}
              · run <code>agora project doctor --deep</code> for credentials and feature enablement.
            </div>
          </div>
        )}

        <Suspense fallback={<LoadingSkeleton />}>
          <ErrorBoundary>
            <AgoraProvider>
              <ConversationComponent
                agoraData={agoraData}
                rtmClient={rtmClient}
                onTokenWillExpire={handleTokenWillExpire}
                onEndConversation={handleEndConversation}
              />
            </AgoraProvider>
          </ErrorBoundary>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full absolute inset-0 space-y-8 px-4">
      <div className="text-center space-y-4">
        <div className="w-32 h-32 rounded-full bg-zinc-800 border-4 border-blue-500 mx-auto flex items-center justify-center relative">
          <div className="absolute inset-0 bg-blue-500/10 rounded-full"></div>
          <Phone className="w-12 h-12 text-blue-400 z-10" />
        </div>
        <h2 className="text-2xl font-semibold text-white">Talk to Nexa</h2>
        <p className="text-zinc-400 max-w-xs mx-auto text-sm">
          Tap to call NexaMart support. Speak in Hindi, English, or Hinglish — check an order, cancel,
          return, change an address, or ask for a human agent.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-lg px-4 py-3 max-w-xs text-center">
          {error}
        </div>
      )}

      <Button
        className="w-48 h-14 text-lg rounded-full bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg shadow-green-900/40 transition-all"
        onClick={handleStartCall}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Phone className="w-5 h-5 mr-2" />
            Start Call
          </>
        )}
      </Button>

      <p className="text-xs text-zinc-600">
        Powered by Agora Conversational AI
      </p>
    </div>
  );
}
