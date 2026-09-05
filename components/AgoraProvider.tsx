"use client";

import React, { useRef } from "react";
import AgoraRTC, { AgoraRTCProvider as Provider } from "agora-rtc-react";

export default function AgoraProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
  
  if (!clientRef.current) {
    clientRef.current = AgoraRTC.createClient({
      mode: "rtc",
      codec: "vp8",
    });
  }

  return <Provider client={clientRef.current}>{children}</Provider>;
}
