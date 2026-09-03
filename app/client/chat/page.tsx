import { redirect } from "next/navigation";

export default function ChatPage() {
  // The legacy text chat used local demo copy. All customer AI interactions
  // must use the managed Agora Conversational AI session instead.
  redirect("/client/voice");
}
