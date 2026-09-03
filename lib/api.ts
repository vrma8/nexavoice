/**
 * NexaVoice API client
 * Calls Next.js API routes which in turn communicate with Agora Conversational AI.
 * Replace stub implementations with real backend calls as the FastAPI backend is built.
 */

export async function sendMessage(content: string): Promise<{ content: string }> {
  // For chat mode: calls the OpenAI-compatible chat completions endpoint
  // which the Agora ConvoAI engine also calls as its "custom LLM" endpoint.
  const res = await fetch("/api/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error("Failed to get response from AI");
  }

  // Parse SSE stream and collect full text response
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
      } catch {
        // skip malformed chunks
      }
    }
  }

  return { content: fullText || "Kuch samajh nahi aaya. Please dobara try karein." };
}

export async function requestEscalation(_reason: string): Promise<{ success: boolean; caseId: string }> {
  // TODO: Wire to FastAPI backend when available.
  // This will POST to /api/escalation/request on the FastAPI server.
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { success: true, caseId: `NV-${Math.floor(1000 + Math.random() * 9000)}` };
}

export async function getActiveCases() {
  // TODO: Wire to FastAPI backend when available.
  // This will GET /api/cases?status=WAITING_FOR_HUMAN from the FastAPI server.
  await new Promise((resolve) => setTimeout(resolve, 400));

  return [
    {
      id: "NV-1024",
      name: "Rahul",
      language: "Hindi-English",
      intent: "Application Status",
      confidence: 42,
      summary: "Caller could not confirm reference number.",
      status: "WAITING_FOR_HUMAN" as const,
    },
    {
      id: "NV-1025",
      name: "Priya",
      language: "English",
      intent: "Billing Issue",
      confidence: 85,
      summary: "Wants to dispute a charge on recent invoice.",
      status: "IN_PROGRESS" as const,
    },
  ];
}
