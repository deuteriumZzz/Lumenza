import { ChatRoutingProvider } from "@/components/chat-routing";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <ChatRoutingProvider>{children}</ChatRoutingProvider>;
}
