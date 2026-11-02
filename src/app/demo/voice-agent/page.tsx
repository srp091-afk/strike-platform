import type { Metadata } from "next";

import { VoiceAgentDemo } from "@/components/demo/voice-agent-demo";

export const metadata: Metadata = {
  title: "STRIKE — демо голосового ИИ-агента",
  description: "Поговорите с голосовым ИИ-агентом STRIKE: вставьте ссылку на сайт и задайте вопрос голосом.",
};

export default function VoiceAgentDemoPage() {
  return <VoiceAgentDemo />;
}
