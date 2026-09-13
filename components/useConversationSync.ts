'use client';

import { useEffect, useRef, useState } from 'react';
import { getConversation, mirrorVoiceState, sendHeartbeat, type TranscriptMirrorItem } from '@/lib/api';
import type { TranscriptMessage } from '@/lib/conversation';
import type { Conversation, SupportCase } from '@/lib/support/types';

const MIRROR_DEBOUNCE_MS = 900;
const POLL_MS = 3000;

export function useConversationSync(opts: {
  conversationId?: string;
  agentUID: string;
  localUID: string;
  messageList: TranscriptMessage[];
  agentState: string | null;
  onConversation?: (conversation: Conversation | null) => void;
}) {
  const { conversationId, agentUID, localUID, messageList, agentState, onConversation } = opts;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const sentTurns = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const pending: TranscriptMirrorItem[] = [];
    for (const item of messageList) {
      const uid = String(item.uid);
      const role: TranscriptMirrorItem['role'] = uid === agentUID ? 'ai' : uid === localUID ? 'user' : 'human_agent';
      const key = `${role}:${item.turn_id}`;
      if (sentTurns.current.get(key) === item.text || !item.text?.trim()) continue;
      sentTurns.current.set(key, item.text);
      const turnId = Number(item.turn_id);
      pending.push({
        role,
        content: item.text,
        turnId: Number.isFinite(turnId) && item.turn_id !== undefined ? turnId : undefined,
      });
    }
    if (pending.length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void mirrorVoiceState(conversationId, { transcript: pending });
    }, MIRROR_DEBOUNCE_MS);
  }, [messageList, conversationId, agentUID, localUID]);

  useEffect(() => {
    if (!conversationId || !agentState) return;
    void mirrorVoiceState(conversationId, { agentState });
  }, [agentState, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const snapshot = await getConversation(conversationId, Number.MAX_SAFE_INTEGER);
        if (cancelled) return;
        setConversation(snapshot.conversation);
        setSupportCase(snapshot.case);
        onConversation?.(snapshot.conversation);
        void sendHeartbeat(conversationId);
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
  }, [conversationId, onConversation]);

  return { conversation, supportCase };
}
