"use client";

import { Building2, Filter, Loader2, MessageSquareHeart, ShoppingBag, Stethoscope, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { saveAgentDirect } from "@/app/agents/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { DEFAULT_ACTIVE_CHANNELS, DEFAULT_CHANNEL_DELAYS } from "@/lib/agent-models";
import { AGENT_TEMPLATES, type AgentTemplate, type AgentTemplateIcon } from "@/lib/agent-templates";

const ICONS: Record<AgentTemplateIcon, LucideIcon> = {
  Building2,
  Filter,
  Stethoscope,
  ShoppingBag,
  MessageSquareHeart,
};

export function AgentTemplatesDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (agentId: string) => void;
}) {
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgentTemplate | null>(null);
  const busy = creatingId !== null;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      if (preview) setPreview(null);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onClose, preview]);

  async function createFromTemplate(template: AgentTemplate) {
    if (busy) return;
    setCreatingId(template.id);
    try {
      const result = await saveAgentDirect(templateFormData(template));
      if (!result.ok || !result.agentId) {
        toast.error(result.error || "Не удалось создать агента из шаблона.");
        return;
      }
      toast.success("Агент создан из шаблона. Замените данные в [квадратных скобках] на данные вашего бизнеса");
      onCreated(result.agentId);
    } catch {
      toast.error("Не удалось создать агента из шаблона.");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4"
      onMouseDown={() => {
        if (!busy && !preview) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-templates-title"
        className="flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Маркетплейс</p>
            <h2 id="agent-templates-title" className="font-heading text-lg font-semibold text-white">
              Библиотека шаблонов
            </h2>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Закрыть
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {AGENT_TEMPLATES.map((template) => {
              const Icon = ICONS[template.icon];
              const creating = creatingId === template.id;
              return (
                <article
                  key={template.id}
                  className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-800 bg-black text-zinc-200">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {template.category}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    <h3 className="font-heading text-lg font-semibold text-white">{template.name}</h3>
                    <p className="text-sm leading-6 text-zinc-400">{template.description}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(template)}>
                      Промпт
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void createFromTemplate(template)}>
                      {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                      {creating ? "Создаём..." : "Создать в 1 клик"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      {preview ? <TemplatePreview template={preview} onClose={() => setPreview(null)} disabled={busy} /> : null}
    </div>
  );
}

function TemplatePreview({
  template,
  onClose,
  disabled,
}: {
  template: AgentTemplate;
  onClose: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4"
      onMouseDown={() => {
        if (!disabled) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        className="flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <h2 id="template-preview-title" className="font-heading text-lg font-semibold text-white">
            {template.name}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={disabled}>
            Закрыть
          </Button>
        </header>
        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-6 text-zinc-300">
          {template.instructions}
        </pre>
      </div>
    </div>
  );
}

function templateFormData(template: AgentTemplate) {
  const data = new FormData();
  data.set("name", template.name);
  data.set("model", template.model);
  data.set("temperature", "0.7");
  data.set("system_prompt", template.instructions);
  data.set("active_channels", JSON.stringify(DEFAULT_ACTIVE_CHANNELS));
  data.set("channel_delays", JSON.stringify(DEFAULT_CHANNEL_DELAYS));
  data.set("human_handoff_duration", "1_hour");
  data.set("telegram_chat_id", "");
  data.set("notify_email_enabled", "false");
  data.set("notify_email_address", "");
  data.set("limit_agent_messages", "0");
  data.set("limit_client_messages", "0");
  data.set("limit_total_messages", "0");
  data.set("split_messages", template.splitMessages ? "true" : "false");
  data.set("followup_enabled", "false");
  data.set("followup_interval_hours", "24");
  data.set("followup_max_count", "2");
  data.set("followup_template", "");
  data.set("wa_instance_id", "");
  data.set("wa_api_token", "");
  data.set("wa_phone_number", "");
  return data;
}
