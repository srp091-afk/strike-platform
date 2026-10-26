"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { cn } from "@/lib/utils";

/** Обязательное согласие с Пользовательским соглашением и Политикой конфиденциальности. */
export function ConsentCheckbox({
  checked,
  onChange,
  invalid = false,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid?: boolean;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={className}>
      <label htmlFor={id} className="group flex cursor-pointer items-start gap-3 text-sm leading-5 text-zinc-400">
        <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
          <input
            id={id}
            type="checkbox"
            required
            checked={checked}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => onChange(event.target.checked)}
            className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md opacity-0"
          />
          <span
            aria-hidden
            className={cn(
              "grid size-5 place-items-center rounded-md border bg-black text-white transition-colors duration-200",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-strike/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black",
              checked ? "border-strike bg-strike" : invalid ? "border-strike/70" : "border-zinc-700 group-hover:border-zinc-500",
            )}
          >
            {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
        </span>
        <span>
          Я согласен с{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-white underline underline-offset-4 transition-colors hover:text-strike-soft"
          >
            Пользовательским соглашением
          </Link>{" "}
          и{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-white underline underline-offset-4 transition-colors hover:text-strike-soft"
          >
            Политикой конфиденциальности
          </Link>
        </span>
      </label>
      {invalid ? (
        <p id={errorId} role="alert" className="mt-2 pl-8 text-xs text-strike-soft">
          Подтвердите согласие, чтобы продолжить.
        </p>
      ) : null}
    </div>
  );
}
