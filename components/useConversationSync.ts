'use client';

import { useEffect, useRef, useState } from 'react';
import type { IMessageListItem } from 'agora-agent-uikit';
import { getConversation, mirrorVoiceState, type TranscriptMirrorItem } from '@/lib/api';
import type { Conversation, SupportCase } from '@/lib/support/types';

const MIRROR_DEBOUNCE_MS = 900;
const POLL_MS = 3000;

/**
 * Keeps the backend conversation record in sync with a live voice call:
 *  - pushes completed transcript turns + agent state (debounced) so the human
 *    dashboard can watch the call in real time and escalation summaries have
 *    context;
 *  - polls the conversation so the caller UI can show "waiting for human" /
 *    "human agent joined" states driven by the backend (never by the browser).
 */
export function useConversationSync(opts: {
  conversationId?: string;
  agentUID: string;
  localUID: string;
  messageList: IMessageListItem[];
  agentState: string | null;
}) {
  const { conversationId, agentUID, localUID, messageList, agentState } = opts;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const sentTurns = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror transcript turns (only new/changed ones).
  useEffect(() => {
    if (!conversationId) return;
    const pending: TranscriptMirrorItem[] = [];
    for (const item of messageList) {
      const uid = String(item.uid);
      const role: TranscriptMirrorItem['role'] = uid === agentUID ? 'ai' : uid === localUID ? 'user' : 'human_agent';
      const key = `${role}:${item.turn_id}`;
      if (sentTurns.current.get(key) === item.text || !item.text?.trim()) continue;
      sentTurns.current.set(key, item.text);
      pending.push({ role, content: item.text, turnId: item.turn_id });
    }
    if (pending.length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void mirrorVoiceState(conversationId, { transcript: pending });
    }, MIRROR_DEBOUNCE_MS);
  }, [messageList, conversationId, agentUID, localUID]);

  // Mirror agent state changes immediately (cheap, low frequency).
  useEffect(() => {
    if (!conversationId || !agentState) return;
    void mirrorVoiceState(conversationId, { agentState });
  }, [agentState, conversationId]);

  // Poll backend state for escalation / human takeover.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const snapshot = await getConversation(conversationId, Number.MAX_SAFE_INTEGER);
        if (cancelled) return;
        setConversation(snapshot.conversation);
        setSupportCase(snapshot.case);
      } catch {
        // transient
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [conversationId]);

  return { conversation, supportCase };
}
