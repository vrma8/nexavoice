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
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="h-96 w-full max-w-md animate-pulse rounded-xl bg-zinc-900" />
    </div>
  );
}
