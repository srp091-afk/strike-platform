"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { adoptCampaignTimeZone } from "@/app/leads/actions";
import {
  browserTimeZone,
  filterTimeZoneChoices,
  isAutomaticTimeZone,
  listTimeZoneChoices,
  type TimeZoneChoice,
} from "@/lib/outreach-schedule";
import { cn } from "@/lib/utils";

const choiceCache = new Map<number, TimeZoneChoice[]>();

function choicesAt(hour: number) {
  const cached = choiceCache.get(hour);
  if (cached) return cached;
  const choices = listTimeZoneChoices();
  choiceCache.set(hour, choices);
  return choices;
}

function useTimeZoneChoices() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 60 * 60 * 1000);
      return () => clearInterval(id);
    },
    () => choicesAt(new Date().getUTCHours()),
    () => choicesAt(0),
  );
}

/** Пока пояс не выбран, записывает в кампанию часовой пояс браузера, чтобы воркер считал окно так же, как бейдж. */
export function useAdoptDefaultTimeZone(
  campaigns: Array<{ id: string; timezone: string; timezone_is_default: boolean | null }>,
  onAdopted: () => void,
) {
  const signature = campaigns
    .filter((campaign) => campaign.timezone_is_default !== false && isAutomaticTimeZone(campaign.timezone))
    .map((campaign) => campaign.id)
    .join(",");
  const onAdoptedRef = useRef(onAdopted);
  useEffect(() => {
    onAdoptedRef.current = onAdopted;
  });
  useEffect(() => {
    if (!signature) return;
    const zone = browserTimeZone();
    let cancelled = false;
    void Promise.all(signature.split(",").map((id) => adoptCampaignTimeZone(id, zone))).then((results) => {
      if (!cancelled && results.some((result) => result.ok && result.changed)) onAdoptedRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);
}

/** На сервере оставляем сохранённое значение. В браузере автоматический UTC заменяется местным поясом. */
export function useEffectiveTimeZone(stored: string | null | undefined, isDefault: boolean | null) {
  const saved = stored?.trim() || "";
  const replace = isDefault !== false && isAutomaticTimeZone(saved);
  return useSyncExternalStore(
    () => () => {},
    () => (replace ? browserTimeZone() : saved || browserTimeZone()),
    () => saved || "UTC",
  );
}

export function TimeZoneField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const choices = useTimeZoneChoices();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = choices.find((choice) => choice.value === value);
  const label = selected?.label ?? (value ? value : "Часовой пояс");
  const matches = useMemo(() => {
    const filtered = filterTimeZoneChoices(choices, query);
    if (query.trim()) return filtered;
    const pinned = [value, browserTimeZone()].filter((zone, index, list) => zone && list.indexOf(zone) === index);
    const pinnedChoices = pinned
      .map((zone) => choices.find((choice) => choice.value === zone))
      .filter((choice): choice is TimeZoneChoice => Boolean(choice));
    return [...pinnedChoices, ...filtered.filter((choice) => !pinned.includes(choice.value))];
  }, [choices, query, value]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 280 && rect.top > spaceBelow;
      setMenuStyle(
        openUp
          ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: Math.max(rect.width, 280) }
          : { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) },
      );
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    place();
    inputRef.current?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-left text-sm text-white outline-none transition-colors hover:border-zinc-700 focus:border-white disabled:opacity-50",
          open && "border-white",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setActiveIndex(0);
        }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              style={{ top: menuStyle.top, bottom: menuStyle.bottom, left: menuStyle.left, width: menuStyle.width }}
              className="fixed z-[90] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
            >
              <div className="border-b border-zinc-800 p-2">
                <input
                  ref={inputRef}
                  value={query}
                  placeholder="Tbilisi, Moscow, UTC+4"
                  aria-label="Поиск часового пояса"
                  aria-controls={listId}
                  className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((index) => Math.max(index - 1, 0));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      const match = matches[activeIndex];
                      if (match) choose(match.value);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setOpen(false);
                    }
                  }}
                />
              </div>
              <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
                {matches.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-500">Ничего не найдено</li>
                ) : (
                  matches.map((choice, index) => {
                    const active = choice.value === value;
                    return (
                      <li key={choice.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={cn(
                            "flex w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/10 hover:text-white",
                            (active || index === activeIndex) && "bg-white/10 text-white",
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => choose(choice.value)}
                        >
                          {choice.label}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
