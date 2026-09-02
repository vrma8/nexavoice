import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexaVoice | Multilingual Voice Agent & Support Console",
  description: "Real-time multilingual phone assistance console with live Hindi/English transcript, AI confidence engine, and human voice takeover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100 min-h-screen antialiased selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
