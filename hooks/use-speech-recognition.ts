'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Browser speech recognition (Web Speech API) used to caption the human agent
 * during a voice handover. The Agora toolkit only transcribes the customer +
 * AI agent while the AI pipeline is running, so once the human takes over we
 * caption both sides from their own microphones and store the words on the
 * conversation — the case page then carries the FULL transcript.
 *
 * Supported in Chrome/Edge/Safari; unsupported browsers (e.g. Firefox) simply
 * return `supported: false` and the call still works without live captions.
 */

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export function useSpeechRecognition(opts: {
  /** Turn captions on/off. Recognition is torn down when false. */
  enabled: boolean;
  /** BCP-47 tag, e.g. 'en-IN' or 'hi-IN'. */
  language?: string;
  /** Called with each final utterance; the consumer dedupes if needed. */
  onFinal?: (text: string) => void;
}) {
  const [supported] = useState(isSpeechRecognitionSupported);
  const [listening, setListening] = useState(false);
  const onFinalRef = useRef(opts.onFinal);

  useEffect(() => {
    onFinalRef.current = opts.onFinal;
  });

  useEffect(() => {
    if (!opts.enabled || !supported) {
      setListening(false);
      return;
    }
    const Ctor = getRecognitionConstructor();
    if (!Ctor) return;

    let active = true;
    let recognition: SpeechRecognitionInstance | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const build = () => {
      if (!active) return;
      const instance = new Ctor();
      recognition = instance;
      instance.lang = opts.language ?? 'en-IN';
      instance.continuous = true;
      instance.interimResults = true;
      instance.onresult = (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
        }
        const trimmed = finalText.trim();
        if (trimmed) onFinalRef.current?.(trimmed);
      };
      // The recognizer ends itself after silence; restart it so captions stay
      // live for the whole call (new instance — a stopped one cannot restart).
      instance.onend = () => {
        if (!active) return;
        setListening(false);
        restartTimer = setTimeout(() => {
          if (!active) return;
          build();
        }, 350);
      };
      instance.onerror = () => {
        // Errors end the session; onend restarts it. No user-visible failure.
      };
      try {
        instance.start();
        setListening(true);
      } catch {
        // start() throws when called twice or permission is denied.
      }
    };

    build();
    return () => {
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        recognition?.stop();
      } catch {
        // already stopped
      }
      setListening(false);
    };
  }, [opts.enabled, opts.language, supported]);

  return { supported, listening };
}
