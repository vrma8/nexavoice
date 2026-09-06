'use client';

import { Headset, Loader2, PhoneOff } from 'lucide-react';
import type { ConversationState } from '@/lib/support/types';

type HandoffBannerProps = {
  state?: ConversationState;
  caseId?: string;
  humanName?: string;
  isHumanConnected: boolean;
  isAgentConnected: boolean;
};

/** Shows the escalation / human takeover status of a live voice call. */
export function HandoffBanner({ state, caseId, humanName, isHumanConnected, isAgentConnected }: HandoffBannerProps) {
  if (isHumanConnected || state === 'HUMAN_HANDLING') {
    return (
      <div
        className="flex items-center justify-center gap-2 border-b border-purple-700/60 bg-purple-900/30 px-4 py-2 text-sm text-purple-100"
        role="status"
      >
        <Headset className="h-4 w-4" />
        {isHumanConnected
          ? `You are now talking to ${humanName ?? 'a human support agent'}.${isAgentConnected ? ' The AI assistant is leaving the call.' : ''}`
          : `${humanName ?? 'A human support agent'} accepted your case and is joining the call…`}
      </div>
    );
  }
  if (state === 'WAITING_FOR_HUMAN') {
    return (
      <div
        className="flex items-center justify-center gap-2 border-b border-yellow-700/60 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-100"
        role="status"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Case {caseId ?? ''} created — please stay on the line, a human agent will join shortly.
      </div>
    );
  }
  if (state === 'RESOLVED' || state === 'CLOSED') {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm text-muted-foreground" role="status">
        <PhoneOff className="h-4 w-4" />
        This conversation has been marked resolved. You can end the call.
      </div>
    );
  }
  return null;
}
