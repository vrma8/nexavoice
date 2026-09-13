import Link from "next/link";
import {
  ArrowRight,
  Github,
  Globe,
  Headset,
  Linkedin,
  Mic,
  ShieldAlert,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { BUILDERS, PROJECT_GITHUB_URL } from "@/lib/site";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* GitHub — top right */}
      <a
        href={PROJECT_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View the source on GitHub"
        title="View the source on GitHub"
        className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(222_25%_16%)] bg-[hsl(222_40%_7%_/_0.8)] text-[hsl(220_10%_60%)] backdrop-blur-sm transition-all hover:border-[hsl(191_100%_50%_/_0.4)] hover:text-white hover:shadow-[0_0_16px_hsl(191_100%_50%_/_0.15)]"
      >
        <Github className="h-5 w-5" />
      </a>
      {/* Background layers */}
      <div className="grid-bg absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,hsl(191_100%_50%_/_0.06),transparent)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 bg-gradient-to-r from-transparent via-[hsl(191_100%_50%_/_0.4)] to-transparent" />

      {/* Ambient orbs */}
      <div className="absolute top-1/4 -left-32 h-64 w-64 rounded-full bg-[hsl(191_100%_50%_/_0.04)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 h-64 w-64 rounded-full bg-[hsl(260_80%_60%_/_0.05)] blur-3xl pointer-events-none" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center px-6 py-16">
        {/* Badge */}
        <div className="animate-fade-up mb-8 inline-flex items-center gap-2 rounded-full border border-[hsl(191_100%_50%_/_0.25)] bg-[hsl(191_100%_50%_/_0.06)] px-4 py-1.5 text-xs font-medium text-[hsl(191_100%_60%)]">
          <Sparkles className="h-3 w-3" />
          Powered by Agora Conversational AI Engine
        </div>

        {/* Wordmark */}
        <div className="animate-fade-up animate-fade-up-d1 mb-4 flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.1)]">
            <Mic className="h-5 w-5 text-[hsl(191_100%_55%)]" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[hsl(191_100%_55%)] animate-pulse" />
          </div>
          <h1 className="font-serif text-5xl md:text-6xl font-normal tracking-tight text-white">
            NexaVoice
          </h1>
        </div>

        <p className="animate-fade-up animate-fade-up-d2 mb-2 max-w-lg text-center text-xl leading-relaxed text-[hsl(220_15%_75%)]">
          Shop NexaMart. Get AI support that speaks your language — and hands off to a human when it counts.
        </p>
        <p className="animate-fade-up animate-fade-up-d2 mb-12 text-center text-sm text-[hsl(220_10%_45%)]">
          Multilingual · Voice &amp; Chat · Real-time escalation
        </p>

        {/* Role cards */}
        <div className="animate-fade-up animate-fade-up-d3 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/login?role=client"
            className="group relative flex flex-col items-start gap-4 rounded-2xl border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.04)] p-6 text-left transition-all duration-200 hover:border-[hsl(191_100%_50%_/_0.4)] hover:bg-[hsl(191_100%_50%_/_0.08)] hover:shadow-[0_0_32px_hsl(191_100%_50%_/_0.12)]"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_55%)]">
                <User className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-[hsl(220_10%_40%)] transition-all group-hover:translate-x-1 group-hover:text-[hsl(191_100%_55%)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Shop as a client</h2>
              <p className="mt-1 text-sm leading-relaxed text-[hsl(220_10%_50%)]">
                Browse NexaMart with an AI support agent always a tap away — voice or chat, in English, Hindi, or
                Hinglish.
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5">
              {["Voice", "Chat", "3 languages"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.06)] px-2.5 py-0.5 text-[11px] text-[hsl(191_100%_60%)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </Link>

          <Link
            href="/login?role=agent"
            className="group relative flex flex-col items-start gap-4 rounded-2xl border border-[hsl(222_25%_18%)] bg-[hsl(222_35%_8%)] p-6 text-left transition-all duration-200 hover:border-[hsl(260_60%_60%_/_0.3)] hover:bg-[hsl(260_60%_60%_/_0.04)] hover:shadow-[0_0_32px_hsl(260_60%_60%_/_0.08)]"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(260_60%_60%_/_0.12)] text-[hsl(260_70%_70%)]">
                <Headset className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-[hsl(220_10%_40%)] transition-all group-hover:translate-x-1 group-hover:text-[hsl(260_70%_70%)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Support agent login</h2>
              <p className="mt-1 text-sm leading-relaxed text-[hsl(220_10%_50%)]">
                Monitor live escalations, view AI handoff summaries, and take over conversations in real time.
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5">
              {["Live dashboard", "AI summaries", "Escalation queue"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[hsl(260_30%_30%)] bg-[hsl(260_60%_60%_/_0.06)] px-2.5 py-0.5 text-[11px] text-[hsl(260_60%_70%)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </Link>
        </div>

        {/* Feature strip */}
        <div className="animate-fade-up animate-fade-up-d4 mt-16 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              label: "Sub-second handoff",
              desc: "AI transfers to a human agent in real time without dropping the call",
            },
            {
              icon: Globe,
              label: "Multilingual by default",
              desc: "English, Hindi, and Hinglish handled natively by the AI voice model",
            },
            {
              icon: ShieldAlert,
              label: "Full audit trail",
              desc: "Every tool call, escalation reason, and action is logged and visible",
            },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-xl border border-[hsl(222_25%_13%)] bg-[hsl(222_40%_5%)] p-4"
            >
              <Icon className="h-4 w-4 text-[hsl(191_100%_50%)]" />
              <p className="text-sm font-medium text-[hsl(220_15%_85%)]">{label}</p>
              <p className="text-xs leading-relaxed text-[hsl(220_10%_45%)]">{desc}</p>
            </div>
          ))}
        </div>

        {/* Builders */}
        <div className="animate-fade-up animate-fade-up-d4 mt-16 w-full max-w-2xl">
          <p className="mb-4 text-center text-[11px] font-semibold tracking-[0.2em] text-[hsl(220_10%_40%)] uppercase">
            Built by
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {BUILDERS.map((builder) => (
              <div
                key={builder.name}
                className="flex items-center gap-4 rounded-2xl border border-[hsl(222_25%_14%)] bg-[hsl(222_40%_6%)] p-5 transition-all hover:border-[hsl(222_25%_22%)]"
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.08)] font-serif text-xl text-[hsl(191_100%_55%)]">
                  {builder.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{builder.name}</p>
                  <p className="truncate text-xs text-[hsl(220_10%_45%)]">{builder.role}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {builder.github && (
                    <a
                      href={builder.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${builder.name} on GitHub`}
                      title={`${builder.name} on GitHub`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(222_25%_18%)] bg-[hsl(222_35%_9%)] text-[hsl(220_10%_55%)] transition-colors hover:border-[hsl(222_25%_28%)] hover:text-white"
                    >
                      <Github className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {builder.linkedin && (
                    <a
                      href={builder.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${builder.name} on LinkedIn`}
                      title={`${builder.name} on LinkedIn`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(222_25%_18%)] bg-[hsl(222_35%_9%)] text-[hsl(220_10%_55%)] transition-colors hover:border-[hsl(202_80%_45%_/_0.5)] hover:text-[hsl(202_90%_60%)]"
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
