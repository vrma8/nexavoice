import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Sign in — NexaVoice",
  description: "Sign in as a NexaMart customer or a support agent.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(223_47%_4%)] px-4 py-10">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="relative z-10 h-96 w-full max-w-md animate-pulse rounded-2xl border border-[hsl(222_25%_15%)] bg-[hsl(222_40%_7%)]" />
    </div>
  );
}
