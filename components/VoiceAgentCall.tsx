"use client";

import { useState, Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import type { RTMClient } from "agora-rtm";
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
  StopConversationRequest,
} from "@/types/conversation";
import { endConversation, mirrorVoiceState, sendHeartbeat } from "@/lib/api";
import { MISSING_APP_ID_MESSAGE, resolveAppId } from "@/lib/agora";
import { getClientSession } from "@/lib/session";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { Button } from "@/components/ui/button";
import {
  Headset,
  Loader2,
  Lock,
  Mic,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Conversation } from "@/lib/support/types";

const ConversationComponent = dynamic(() => import("./ConversationComponent"), {
  ssr: false,
});

const AgoraProvider = dynamic(() => import("./AgoraProvider"), { ssr: false });

interface AgentJoinError {
  message: string;
  hint?: string;
}

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

export default function VoiceAgentCall({
  onCallEnded,
  onConversationSnapshot,
}: {
  onCallEnded?: () => void;
  onConversationSnapshot?: (conversation: Conversation | null) => void;
} = {}) {
  const [showConversation, setShowConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState<AgentJoinError | null>(null);
  const [toolsEnabled, setToolsEnabled] = useState(true);

  useEffect(() => {
    import("agora-rtc-react").catch(() => {});
    import("agora-rtm").catch(() => {});
  }, []);

  const conversationId = agoraData?.conversationId;
  useEffect(() => {
    if (!conversationId || !showConversation) return;
    void sendHeartbeat(conversationId);
    const beat = setInterval(() => void sendHeartbeat(conversationId), 8000);
    const leave = () => endConversation(conversationId, true);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(beat);
      window.removeEventListener("pagehide", leave);
    };
  }, [conversationId, showConversation]);

  const handleStartCall = async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(null);
    let rtmFailure: string | null = null;

    try {
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

      const session = getClientSession();
      const [agentData, rtm] = await Promise.all([
        fetch("/api/invite-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            client_id: session?.id,
            customer_name: session?.name,
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

        (async () => {
          const { default: AgoraRTM } = await import("agora-rtm");
          const rtm: RTMClient = new AgoraRTM.RTM(appId, responseData.uid);
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          return rtm;
        })().catch((err) => {
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

      setToolsEnabled(agentData?.tools_enabled !== false);
      setRtmClient(rtm);
      setAgoraData({
        ...responseData,
        appId,
        agentId: agentData?.agent_id,
        conversationId: agentData?.conversation_id,
      });
      setShowConversation(true);
    } catch (err) {
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

  const handleTokenWillExpire = async (
    uid: string,
  ): Promise<AgoraRenewalTokens> => {
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
  };

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
    onCallEnded?.();
  };

  if (showConversation && agoraData && rtmClient) {
    return (
      <div className="flex h-full flex-col absolute inset-0">
        {agentJoinError && (
          <div
            className="space-y-1 p-3 text-center text-sm text-red-300 border-b border-red-500/25 bg-red-500/10"
            role="alert"
          >
            <div className="font-medium text-red-200">
              The AI agent could not join this call: {agentJoinError.message}
            </div>
            {agentJoinError.hint && (
              <div className="text-xs text-red-300/80">{agentJoinError.hint}</div>
            )}
            <div className="text-xs text-muted-foreground">
              Deployment self-check:{" "}
              <a href="/api/health" target="_blank" rel="noreferrer" className="underline">
                /api/health
              </a>{" "}
              · run <code>agora project doctor --deep</code> for credentials and feature enablement.
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <Suspense fallback={<LoadingSkeleton />}>
            <ErrorBoundary>
              <AgoraProvider>
                <ConversationComponent
                  agoraData={agoraData}
                  rtmClient={rtmClient}
                  onTokenWillExpire={handleTokenWillExpire}
                  onEndConversation={handleEndConversation}
                  onConversationSnapshot={onConversationSnapshot}
                  toolsEnabled={toolsEnabled}
                />
              </AgoraProvider>
            </ErrorBoundary>
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto px-6 py-8">
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-start pt-4 text-center">
        {/* Avatar */}
        <div className="relative mb-5">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[hsl(191_100%_50%_/_0.3)] bg-[hsl(191_100%_50%_/_0.08)]">
            <Mic className="h-10 w-10 text-[hsl(191_100%_55%)]" />
          </div>
          <div
            className="absolute inset-0 rounded-full border border-[hsl(191_100%_50%_/_0.15)] animate-ping"
            style={{ animationDuration: "2s" }}
          />
        </div>

        <p className="text-base font-semibold text-white">Voice call with Nexa</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Speak in Hindi, English, or Hinglish — Nexa can check orders, edit your
          cart, place or cancel an order, and hand you to a human agent.
        </p>

        <ul className="mt-5 w-full space-y-2 text-left">
          {[
            { icon: Package, text: "“Where is my order NM-10023?”" },
            { icon: Sparkles, text: "“Replace the kettle with the Philips one”" },
            { icon: Headset, text: "“Connect me to a human agent”" },
          ].map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card/60 px-3 py-2 text-xs text-card-foreground"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(191_100%_55%)]" />
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Ready to connect
        </div>
      </div>

      {error && (
        <div className="mt-5 w-full max-w-sm rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Primary action + reassurance */}
      <div className="mt-auto flex w-full max-w-sm flex-col items-center gap-3 pb-2 pt-8">
        {/* Start call button */}
        <Button
          className="h-12 w-full rounded-full border-none bg-[hsl(191_100%_50%)] px-8 text-base font-semibold text-[hsl(223_47%_4%)] shadow-lg shadow-[hsl(191_100%_50%_/_0.2)] transition-all hover:bg-[hsl(191_100%_45%)]"
          onClick={handleStartCall}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              <Phone className="mr-2 h-5 w-5" />
              Start voice call
            </>
          )}
        </Button>

        <ul className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1">
            <Lock className="h-3 w-3" /> Private
          </li>
          <li className="text-[hsl(220_10%_30%)]">•</li>
          <li className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> No card details ever
          </li>
          <li className="text-[hsl(220_10%_30%)]">•</li>
          <li>No app needed</li>
        </ul>

        <p className="text-center text-xs text-muted-foreground">
          Powered by Agora Conversational AI
        </p>
      </div>
    </div>
  );
}
