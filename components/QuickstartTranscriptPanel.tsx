'use client';

import { useEffect, useMemo, useRef } from 'react';

type TranscriptMessage = {
  turn_id?: string | number;
  uid: number;
  text?: string;
  createdAt?: number;
};

type QuickstartTranscriptPanelProps = {
  messageList: TranscriptMessage[];
  currentInProgressMessage: TranscriptMessage | null;
  agentUID: string;
  /** Real RTC uid of the local user (sentinel \"0\" is remapped before this). */
  localUID?: string;
  /** Well-known uid of the human support agent (654321). */
  humanUID?: string;
};

function formatMessageTime(createdAt?: number) {
  if (!createdAt) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function QuickstartTranscriptPanel({
  messageList,
  currentInProgressMessage,
  agentUID,
  localUID,
  humanUID,
}: QuickstartTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () =>
      currentInProgressMessage
        ? [...messageList, currentInProgressMessage]
        : messageList,
    [currentInProgressMessage, messageList],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card/20"
      aria-label="Transcription panel"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Transcript</h2>
          <p className="text-xs text-muted-foreground">Live voice turns</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Start speaking to see the live transcript here.
          </div>
        ) : (
          messages.map((message, index) => {
            const uid = String(message.uid);
            const isAgent = uid === agentUID;
            const isHuman = uid === humanUID;
            const isLocal = uid === localUID;
            const label = isAgent
              ? 'Nexa (AI)'
              : isHuman
                ? 'Human agent'
                : isLocal
                  ? 'You'
                  : 'Participant';
            const text = message.text?.trim();
            const time = formatMessageTime(message.createdAt);

            return (
              <article
                key={`${message.turn_id ?? message.uid}-${index}`}
                className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
                  <span>{label}</span>
                  {time && <span className="font-normal">{time}</span>}
                </div>
                <div
                  className={`max-w-full whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-6 ${
                    isLocal
                      ? 'border-[#d7d7d7] bg-[#fdfcfb] text-black'
                      : isHuman
                        ? 'border-purple-800/60 bg-purple-950/40 text-[#efe7ff]'
                        : 'border-[#2f2f2f] bg-[#212121] text-[#e7e7e7]'
                  }`}
                >
                  {text || '...'}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
