"use client";

import React, { useState } from "react";
import AgoraRTC, { AgoraRTCProvider as Provider } from "agora-rtc-react";

export default function AgoraProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client] = useState(() => AgoraRTC.createClient({ mode: "rtc", codec: "vp8" }));

  return <Provider client={client}>{children}</Provider>;
}
