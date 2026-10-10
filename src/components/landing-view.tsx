"use client";

import type { LandingRecord, LandingSection } from "@/lib/landing-types";
import { LandingWidget } from "@/components/landing-widget";

export function LandingView({ landing }: { landing: LandingRecord }) {
  const { theme } = landing.document;

  return (
    <div
      className="relative min-h-full"
      style={{ background: theme.background, color: theme.foreground, ["--landing-accent" as string]: theme.accent }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 py-16 pb-36 sm:px-10">
        {landing.document.sections.map((section, index) => (
          <SectionView key={`${section.type}-${index}`} section={section} accent={theme.accent} />
        ))}
      </div>
      <LandingWidget key={`${landing.id}-${landing.captureMode}-${landing.welcomeMessage}`} landing={landing} />
    </div>
  );
}

function SectionView({ section, accent }: { section: LandingSection; accent: string }) {
  const { content } = section;

  if (section.type === "hero") {
    return (
      <header className="grid gap-6 pt-6">
        {content.eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: accent }}>
            {content.eyebrow}
          </p>
        ) : null}
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{content.headline}</h1>
        {content.text ? <p className="max-w-2xl text-lg leading-8 opacity-70">{content.text}</p> : null}
        <div className="flex flex-wrap gap-3">
          {content.primaryCta ? (
            <a href="#landing-chat" className="rounded-full px-5 py-3 text-sm font-semibold text-white" style={{ background: accent }}>
              {content.primaryCta}
            </a>
          ) : null}
          {content.secondaryCta ? (
            <a href="#landing-chat" className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold">
              {content.secondaryCta}
            </a>
          ) : null}
        </div>
      </header>
    );
  }

  if (section.type === "stats") {
    return (
      <section className="grid gap-8">
        <SectionTitle title={content.headline} text={content.text} />
        <ul className="grid gap-6 sm:grid-cols-3">
          {content.items.map((item) => (
            <li key={item.title}>
              <p className="text-4xl font-semibold tracking-tight" style={{ color: accent }}>
                {cleanMeta(item.meta) || item.title}
              </p>
              <p className="mt-2 text-sm opacity-70">{item.text || item.title}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (section.type === "reviews") {
    return (
      <section className="grid gap-8">
        <SectionTitle title={content.headline} text={content.text} />
        <ul className="grid gap-4 md:grid-cols-2">
          {content.items.map((item) => (
            <li key={item.title} className="rounded-3xl bg-white/80 p-6 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.45)]">
              <p className="text-lg leading-8">“{item.text}”</p>
              <p className="mt-4 text-sm font-semibold">{item.title}</p>
              {cleanMeta(item.meta) ? <p className="text-xs opacity-60">{cleanMeta(item.meta)}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (section.type === "faq") {
    return (
      <section className="grid gap-6">
        <SectionTitle title={content.headline} text={content.text} />
        <div className="grid gap-3">
          {content.items.map((item) => (
            <details key={item.title} className="rounded-2xl bg-white/70 px-5 py-4">
              <summary className="cursor-pointer text-base font-semibold">{item.title}</summary>
              <p className="mt-3 text-sm leading-6 opacity-70">{item.text}</p>
            </details>
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "cta") {
    return (
      <section className="rounded-[32px] px-8 py-12 text-white" style={{ background: accent }}>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">{content.headline}</h2>
        {content.text ? <p className="mt-4 max-w-xl text-base leading-7 text-white/80">{content.text}</p> : null}
        {content.primaryCta ? (
          <a href="#landing-chat" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950">
            {content.primaryCta}
          </a>
        ) : null}
      </section>
    );
  }

  return (
    <section className="grid gap-8">
      <SectionTitle title={content.headline} text={content.text} eyebrow={content.eyebrow} />
      <ul className={section.type === "steps" ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
        {content.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="rounded-3xl bg-white/75 p-6 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.4)]">
            {section.type === "steps" ? (
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>
                0{index + 1}
              </p>
            ) : null}
            <div className="mt-2 flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              {cleanMeta(item.meta) ? (
                <span className="shrink-0 text-sm font-semibold" style={{ color: accent }}>
                  {cleanMeta(item.meta)}
                </span>
              ) : null}
            </div>
            {item.text ? <p className="mt-2 text-sm leading-6 opacity-70">{item.text}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function cleanMeta(value: string) {
  return value.replace(/^(цена|роль|цифра)\s*:\s*/i, "").trim();
}

function SectionTitle({ eyebrow, title, text }: { eyebrow?: string; title: string; text: string }) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{eyebrow}</p> : null}
      {title ? <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2> : null}
      {text ? <p className="mt-3 text-base leading-7 opacity-70">{text}</p> : null}
    </div>
  );
}
