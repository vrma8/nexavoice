"use client";

import { useState, useRef, Suspense, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { RTMClient } from "agora-rtm";
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
} from "@/types/conversation";
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

export default function VoiceAgentCall() {
  const router = useRouter();
  const [showConversation, setShowConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);

  // Preload heavy modules on mount
  useEffect(() => {
    import("agora-rtc-react").catch(() => {});
    import("agora-rtm").catch(() => {});
  }, []);

  const handleStartCall = async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);

    try {
      // 1. Fetch RTC token + channel
      const agoraResponse = await fetch("/api/generate-agora-token");
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok) {
        throw new Error(`Failed to generate Agora token: ${JSON.stringify(responseData)}`);
      }

      // 2. Run agent invite and RTM setup in parallel
      const [agentData, rtm] = await Promise.all([
        // 2a. Start the AI agent
        fetch("/api/invite-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) {
              setAgentJoinError(true);
              return null;
            }
            return res.json() as Promise<AgentResponse>;
          })
          .catch((err) => {
            console.error("Failed to start conversation with agent:", err);
            setAgentJoinError(true);
            return null;
          }),

        // 2b. Set up RTM
        (async () => {
          const { default: AgoraRTM } = await import("agora-rtm");
          const rtm: RTMClient = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            responseData.uid
          );
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          return rtm;
        })(),
      ]);

      setRtmClient(rtm);
      setAgoraData({ ...responseData, agentId: agentData?.agent_id });
      setShowConversation(true);
    } catch (err) {
      setError("Failed to start call. Please check your microphone and try again.");
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
          body: JSON.stringify({ agent_id: agoraData.agentId }),
        });
      } catch (error) {
        console.error("Error stopping agent:", error);
      }
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
          <div className="p-3 bg-red-900/30 text-red-400 text-sm text-center">
            Failed to connect AI agent. The call may not work as expected.
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
        <h2 className="text-2xl font-semibold text-white">AI Voice Assistant</h2>
        <p className="text-zinc-400 max-w-xs mx-auto text-sm">
          Tap the button to start your multilingual call. Speak in Hindi, English, or Hinglish.
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
