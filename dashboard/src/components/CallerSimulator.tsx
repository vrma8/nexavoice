"use client";

import React, { useState, useEffect } from "react";
import { Mic, MicOff, Send, PhoneCall, Volume2, Sparkles, VolumeX, AlertCircle, Play, ShieldAlert, Cpu } from "lucide-react";

interface CallerSimulatorProps {
  activeCallId?: string;
  onCallCreated: (callId: string) => void;
  onTurnProcessed: (callId: string) => void;
}

const DEMO_PRESETS = [
  {
    id: "demo1",
    title: "Demo 1: Normal Inquire (Hindi)",
    lang: "Hindi",
    text: "Mujhe apne application ka status check karna tha.",
    desc: "Citizen asks in Hindi to check status",
  },
  {
    id: "demo2",
    title: "Demo 2: Code-Switching (Hinglish)",
    lang: "Hinglish",
    text: "Actually status update nahi hua and I submitted it last week.",
    desc: "Natural Hindi + English mixed code-switch",
  },
  {
    id: "demo3",
    title: "Demo 3: Confirmation Flow",
    lang: "English",
    text: "My reference number is 5281.",
    desc: "AI triggers confirmation for reference number",
  },
  {
    id: "demo4",
    title: "Demo 4: Interruption & Correction",
    lang: "Hinglish",
    text: "No wait, sorry! It's actually 5821.",
    desc: "Caller interrupts mid-turn and corrects reference ID",
    interruption: true,
  },
  {
    id: "demo5",
    title: "Demo 5: Low Confidence & Noise",
    lang: "Hinglish",
    text: "Mera woh... office mein... awaaz nahi aa rahi...",
    desc: "Noisy speech triggers clarification / low confidence",
    noise: true,
    asrConf: 0.35,
  },
  {
    id: "demo6",
    title: "Demo 6: Medical Safety Policy",
    lang: "Hindi",
    text: "Mujhe bohot severe chest pain ho raha hai, kya medicine loon?",
    desc: "Safety restriction triggers immediate human handoff",
  },
  {
    id: "demo7",
    title: "Demo 7: Legal Query Safety",
    lang: "English",
    text: "Can I legally file a lawsuit against the department for delay?",
    desc: "Legal restriction triggers human handoff",
  },
];

export const CallerSimulator: React.FC<CallerSimulatorProps> = ({
  activeCallId,
  onCallCreated,
  onTurnProcessed,
}) => {
  const [callId, setCallId] = useState<string | null>(activeCallId || null);
  const [inputText, setInputText] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [hasNoise, setHasNoise] = useState(false);
  const [isInterruption, setIsInterruption] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lastResponse, setLastResponse] = useState<string>("");
  const [lastConfidence, setLastConfidence] = useState<any>(null);
  const [escalationStatus, setEscalationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (activeCallId) {
      setCallId(activeCallId);
    }
  }, [activeCallId]);

  const startNewCall = async () => {
    setIsCalling(true);
    try {
      const res = await fetch("http://localhost:8000/api/calls/incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller_number: "+919876543210" }),
      });
      const data = await res.json();
      setCallId(data.id);
      onCallCreated(data.id);
      setLastResponse("Call connected to NexaVoice AI Helpline.");
    } catch (err) {
      console.error("Failed to start call", err);
    } finally {
      setIsCalling(false);
    }
  };

  const sendTurn = async (textToSend?: string, noiseOverride?: boolean, interruptionOverride?: boolean, asrOverride?: number) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    let targetCallId = callId;
    if (!targetCallId) {
      // Auto-start call if not active
      const res = await fetch("http://localhost:8000/api/calls/incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller_number: "+919876543210" }),
      });
      const data = await res.json();
      targetCallId = data.id;
      setCallId(data.id);
      onCallCreated(data.id);
    }

    try {
      const res = await fetch("http://localhost:8000/api/calls/process-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: targetCallId,
          user_transcript: text,
          asr_confidence: asrOverride !== undefined ? asrOverride : (hasNoise || noiseOverride ? 0.45 : 0.96),
          has_background_noise: noiseOverride !== undefined ? noiseOverride : hasNoise,
          is_interruption: interruptionOverride !== undefined ? interruptionOverride : isInterruption,
        }),
      });
      const data = await res.json();
      setLastResponse(data.ai_response_text);
      setLastConfidence(data.confidence_breakdown);
      if (data.escalation_triggered) {
        setEscalationStatus(data.escalation_reason);
      }
      setInputText("");
      onTurnProcessed(targetCallId!);

      // Audio Playback via Web Speech API
      if (ttsEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(data.ai_response_text);
        utterance.lang = data.language_used === "hindi" ? "hi-IN" : "en-IN";
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error("Failed to process turn", err);
    }
  };

  // Browser Speech Recognition
  const toggleSpeechRecognition = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Web Speech API is not supported in this browser. Please use Chrome/Edge or type directly.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "hi-IN"; // Supports Hindi & English mixed
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(transcript);
      sendTurn(transcript);
    };

    recognition.start();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-6 border-cyan-500/20 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <PhoneCall className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Citizen Phone Call Simulator</h2>
              <p className="text-xs text-slate-400">
                Simulate phone audio in Hindi, English, and Hinglish with live interruption & noise toggles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                ttsEnabled
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              AI Voice Speech {ttsEnabled ? "ON" : "OFF"}
            </button>

            <button
              onClick={startNewCall}
              disabled={isCalling}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-500/20"
            >
              <PhoneCall className="w-4 h-4" />
              {isCalling ? "Dialing..." : "Start Fresh Call"}
            </button>
          </div>
        </div>

        {/* Call Info Status */}
        {callId && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Call Active: <strong className="text-cyan-400">{callId.slice(0, 8)}...</strong></span>
            </div>
            {escalationStatus && (
              <span className="px-2.5 py-0.5 rounded-full text-rose-400 bg-rose-950/60 border border-rose-800 font-sans text-[11px] font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Escalated: {escalationStatus.replace("_", " ")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 7 Demo Preset Scenarios (Section 50) */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">Hackathon Demo Scenarios (One-Click Testing)</h3>
          </div>
          <span className="text-[11px] text-slate-400">Section 50 Validation Flows</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DEMO_PRESETS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => sendTurn(preset.text, preset.noise, preset.interruption, preset.asrConf)}
              className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/60 hover:bg-slate-850 cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    {preset.title}
                  </h4>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {preset.lang}
                  </span>
                </div>
                <p className="text-xs text-amber-300/90 font-serif italic mt-1.5">"{preset.text}"</p>
                <p className="text-[11px] text-slate-400 mt-1">{preset.desc}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-cyan-400 font-medium">
                <span>Click to Simulate Speech</span>
                <Play className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Input & Voice Interaction Box */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-100">Custom Caller Speech Input</h3>

        {/* Modifiers: Background Noise & Interruption Toggles */}
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={hasNoise}
              onChange={(e) => setHasNoise(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Simulate Noisy Environment (Reduces ASR Score)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={isInterruption}
              onChange={(e) => setIsInterruption(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Simulate Mid-Sentence Interruption</span>
          </label>
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSpeechRecognition}
            className={`p-3 rounded-xl border transition-all ${
              isListening
                ? "bg-rose-600 text-white animate-pulse border-rose-500 shadow-lg shadow-rose-600/30"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700"
            }`}
            title="Click to speak through microphone"
          >
            {isListening ? <Mic className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendTurn()}
            placeholder="Type or speak caller phrase in Hindi, English, or Hinglish..."
            className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
          />

          <button
            onClick={() => sendTurn()}
            className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md shadow-cyan-600/20"
          >
            <Send className="w-4 h-4" />
            Speak
          </button>
        </div>

        {/* Last AI Response Display */}
        {lastResponse && (
          <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-cyan-400">NexaVoice AI Response</span>
              {lastConfidence && (
                <span className="font-mono text-[11px] text-slate-400">
                  Confidence: {Math.round(lastConfidence.overall_confidence * 100)}% ({lastConfidence.confidence_level})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-200 font-sans leading-relaxed">{lastResponse}</p>
          </div>
        )}
      </div>
    </div>
  );
};
