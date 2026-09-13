"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Github, Headset, Loader2, Mic, User } from "lucide-react";
import { saveAgentSession, saveClientSession } from "@/lib/session";
import { PROJECT_GITHUB_URL } from "@/lib/site";

type Role = "client" | "agent";

interface LoginResult {
  ok?: boolean;
  error?: string;
  client?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    tier: string;
    city: string;
    address: string;
    preferredLanguage: string;
  };
  agent?: { id: string; name: string; email: string; title: string };
}

const DEMO_CLIENTS = [
  { name: "Rahul Sharma", email: "rahul.sharma@example.com", phone: "9876543210", city: "Delhi", address: "B-42, Lajpat Nagar II, New Delhi 110024", preferredLanguage: "hinglish", tier: "prime" },
  { name: "Priya Nair", email: "priya.nair@example.com", phone: "9123456780", city: "Bengaluru", address: "12, 4th Cross, Indiranagar, Bengaluru 560038", preferredLanguage: "english", tier: "standard" },
  { name: "Amit Verma", email: "amit.verma@example.com", phone: "9988776655", city: "Lucknow", address: "221, Gomti Nagar, Lucknow 226010", preferredLanguage: "hindi", tier: "standard" },
];

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole: Role = searchParams.get("role") === "agent" ? "agent" : "client";

  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [language, setLanguage] = useState("english");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchRole = (next: Role) => {
    setRole(next);
    setError(null);
    if (next === "client") setTitle("");
  };

  const fillClient = (demo: (typeof DEMO_CLIENTS)[number]) => {
    setName(demo.name);
    setEmail(demo.email);
    setPhone(demo.phone);
    setCity(demo.city);
    setAddress(demo.address);
    setLanguage(demo.preferredLanguage);
    setError(null);
  };

  const fillAgent = () => {
    setName("Kavya R.");
    setEmail("kavya.r@nexamart.example");
    setTitle("Senior Support Agent");
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          role === "client"
            ? { role, name, email, phone, city, address, preferredLanguage: language }
            : { role, name, email, title },
        ),
      });
      const data = (await res.json()) as LoginResult;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Login failed. Please try again.");
        return;
      }
      if (role === "client" && data.client) {
        saveClientSession(data.client);
        router.push("/client");
      } else if (role === "agent" && data.agent) {
        saveAgentSession(data.agent);
        router.push("/support-agent");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,hsl(191_100%_50%_/_0.04),transparent)]" />

      {/* GitHub — top right */}
      <a
        href={PROJECT_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View the source on GitHub"
        title="View the source on GitHub"
        className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(222_25%_16%)] bg-[hsl(222_40%_7%_/_0.8)] text-[hsl(220_10%_60%)] backdrop-blur-sm transition-all hover:border-[hsl(191_100%_50%_/_0.4)] hover:text-white"
      >
        <Github className="h-5 w-5" />
      </a>

      <div className="animate-fade-up relative z-10 w-full max-w-md">
        {/* Back */}
        <Link
          href="/"
          className="mb-6 flex items-center gap-1.5 text-sm text-[hsl(220_10%_50%)] transition-colors hover:text-[hsl(220_15%_75%)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>

        {/* Card */}
        <div className="glass-panel rounded-2xl p-6 shadow-2xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3 border-b border-[hsl(222_25%_15%)] pb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.1)]">
              <Mic className="h-4 w-4 text-[hsl(191_100%_55%)]" />
            </div>
            <div>
              <h1 className="font-semibold text-white">NexaVoice</h1>
              <p className="text-xs text-[hsl(220_10%_45%)]">Sign in to NexaMart support</p>
            </div>
          </div>

          {/* Role toggle */}
          <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(223_47%_4%)] p-1">
            <button
              type="button"
              onClick={() => switchRole("client")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                role === "client"
                  ? "border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_60%)] shadow-inner"
                  : "border border-transparent text-[hsl(220_10%_45%)] hover:text-[hsl(220_15%_65%)]"
              }`}
            >
              <User className="h-3.5 w-3.5" /> Client
            </button>
            <button
              type="button"
              onClick={() => switchRole("agent")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                role === "agent"
                  ? "border border-[hsl(260_60%_60%_/_0.2)] bg-[hsl(260_60%_60%_/_0.12)] text-[hsl(260_70%_70%)] shadow-inner"
                  : "border border-transparent text-[hsl(220_10%_45%)] hover:text-[hsl(220_15%_65%)]"
              }`}
            >
              <Headset className="h-3.5 w-3.5" /> Support Agent
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === "client" ? (
              <>
                <Field label="Full name">
                  <input
                    className="input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    required
                    autoComplete="name"
                  />
                </Field>
                <Field label="Email address">
                  <input
                    type="email"
                    className="input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </Field>
                <Field label="Registered mobile number">
                  <input
                    type="tel"
                    className="input-field"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit number, e.g. 9876543210"
                    required
                    autoComplete="tel"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <input
                      className="input-field"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Delhi"
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field label="Language">
                    <select className="input-field" value={language} onChange={(e) => setLanguage(e.target.value)}>
                      <option value="english">English</option>
                      <option value="hindi">Hindi</option>
                      <option value="hinglish">Hinglish</option>
                    </select>
                  </Field>
                </div>
                <Field label="Delivery address">
                  <input
                    className="input-field"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House/flat, area, city, PIN"
                    autoComplete="street-address"
                  />
                </Field>

                {/* Demo pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-[hsl(220_10%_40%)]">Quick fill:</span>
                  {DEMO_CLIENTS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => fillClient(c)}
                      className="rounded-full border border-[hsl(222_25%_20%)] bg-[hsl(222_35%_10%)] px-2.5 py-0.5 text-[11px] text-[hsl(220_10%_55%)] transition-colors hover:border-[hsl(191_100%_50%_/_0.3)] hover:text-white"
                    >
                      {c.name.split(" ")[0]}
                      {c.tier === "prime" && <span className="ml-1 text-[hsl(191_100%_55%)]">★</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <Field label="Full name">
                  <input
                    className="input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kavya R."
                    required
                    autoComplete="name"
                  />
                </Field>
                <Field label="Work email">
                  <input
                    type="email"
                    className="input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@nexamart.example"
                    required
                    autoComplete="email"
                  />
                </Field>
                <Field label="Title">
                  <input
                    className="input-field"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Support Agent"
                  />
                </Field>
                <button
                  type="button"
                  onClick={fillAgent}
                  className="text-xs text-[hsl(260_70%_65%)] transition-colors hover:text-[hsl(260_70%_75%)]"
                >
                  Use demo agent (Kavya R.) →
                </button>
              </>
            )}

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary mt-2 w-full"
              disabled={loading}
              style={role === "agent" ? { background: "hsl(260 60% 60%)", color: "white" } : undefined}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {role === "client" ? "Continue to shopping" : "Open agent dashboard"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] text-[hsl(220_10%_35%)]">
            Details are saved to the NexaVoice PostgreSQL database.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[hsl(220_10%_50%)]">{label}</span>
      {children}
    </label>
  );
}
