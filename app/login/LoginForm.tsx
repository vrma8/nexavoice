"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Headset, Loader2, User } from "lucide-react";
import { saveAgentSession, saveClientSession } from "@/lib/session";

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

const DEMO_AGENT = { name: "Kavya R.", email: "kavya.r@nexamart.example", title: "Senior Support Agent" };

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
    setName(DEMO_AGENT.name);
    setEmail(DEMO_AGENT.email);
    setTitle(DEMO_AGENT.title);
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
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="text-left">
            <h1 className="text-xl font-bold tracking-tight">NexaVoice</h1>
            <p className="text-xs text-zinc-500">Sign in to NexaMart support</p>
          </div>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => switchRole("client")}
            className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              role === "client" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <User className="h-4 w-4" /> Client
          </button>
          <button
            type="button"
            onClick={() => switchRole("agent")}
            className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              role === "agent" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Headset className="h-4 w-4" /> Support Agent
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {role === "client" ? (
            <>
              <Field label="Full name">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  required
                  autoComplete="name"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
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
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit number, e.g. 9876543210"
                  required
                  autoComplete="tel"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City (optional)">
                  <input
                    className={inputClass}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Delhi"
                    autoComplete="address-level2"
                  />
                </Field>
                <Field label="Language">
                  <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                </Field>
              </div>
              <Field label="Delivery address (optional)">
                <input
                  className={inputClass}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House/flat, area, city, PIN code"
                  autoComplete="street-address"
                />
              </Field>
              <DemoRow
                label="Demo accounts:"
                items={DEMO_CLIENTS.map((c) => c.name.split(" ")[0])}
                onClick={(i) => fillClient(DEMO_CLIENTS[i])}
              />
            </>
          ) : (
            <>
              <Field label="Full name">
                <input
                  className={inputClass}
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
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nexamart.example"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Title (optional)">
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Support Agent"
                />
              </Field>
              <button type="button" onClick={fillAgent} className="text-xs text-purple-400 hover:text-purple-300">
                Use the demo agent (Kavya)
              </button>
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" className="w-full py-2.5" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : role === "client" ? "Continue to shopping" : "Open agent dashboard"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] text-zinc-600">
          Your details are saved to the NexaVoice database (PostgreSQL) and shown across the support pages.
        </p>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function DemoRow({ label, items, onClick }: { label: string; items: string[]; onClick: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-zinc-500">{label}</span>
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          onClick={() => onClick(i)}
          className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-300 hover:border-blue-500 hover:text-white"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
