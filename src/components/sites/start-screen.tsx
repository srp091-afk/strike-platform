"use client";

import { Check, Clock, Home, Lock, MapPin, Shield, Star, Unlock, Wallet } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { QuizGift, QuizSchema, StartBullet, ThemeConfig } from "@/lib/sites/quiz-schema";
import { questionPhrase, stripMarkers, tightenHeadline } from "@/lib/sites/quiz-polish";
import { contrastInk, quizPalette, type QuizPalette } from "@/lib/sites/theme";

const ICONS = { check: Check, clock: Clock, home: Home, map: MapPin, shield: Shield, star: Star, wallet: Wallet };

export function stepsLeftLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "шаг" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "шага" : "шагов";
  return `${count} ${word}`;
}

export function StartScreen({
  schema,
  theme,
  siteTitle,
  compact = false,
  onStart,
}: {
  schema: QuizSchema;
  theme: ThemeConfig;
  siteTitle: string;
  compact?: boolean;
  onStart: () => void;
}) {
  const palette = quizPalette(theme);
  const start = schema.startScreen;
  const gifts = schema.giftsConfig.showOnStart ? schema.giftsConfig.items : [];
  const overMedia = (start.layout === "cinematic_hero" || start.layout === "spotlight_center") && Boolean(start.media.url);
  const tone = overMedia
    ? { fg: "#F4F4F5", muted: "rgba(244,244,245,0.74)", line: "rgba(255,255,255,0.12)", dark: true }
    : { fg: palette.fg, muted: palette.muted, line: palette.line, dark: theme.preset === "dark_premium" };
  const copy = (
    <Copy
      schema={schema}
      theme={theme}
      siteTitle={siteTitle}
      palette={palette}
      tone={tone}
      gifts={gifts}
      compact={compact}
      align={start.layout === "spotlight_center" ? "center" : "left"}
      onStart={onStart}
    />
  );
  const editorialCopy = (
    <Copy
      schema={schema}
      theme={theme}
      siteTitle={siteTitle}
      palette={palette}
      tone={{ fg: palette.fg, muted: palette.muted, line: palette.line, dark: theme.preset === "dark_premium" }}
      gifts={gifts}
      compact={compact}
      align="left"
      onStart={onStart}
    />
  );

  if (start.layout === "editorial_split") {
    if (compact) return <EditorialMobile palette={palette} theme={theme} start={start} siteTitle={siteTitle} content={editorialCopy} />;
    return (
      <div className="h-full min-h-0">
        <div className="h-full md:hidden">
          <EditorialMobile
            palette={palette}
            theme={theme}
            start={start}
            siteTitle={siteTitle}
            content={(
              <Copy
                schema={schema}
                theme={theme}
                siteTitle={siteTitle}
                palette={palette}
                tone={{ fg: palette.fg, muted: palette.muted, line: palette.line, dark: theme.preset === "dark_premium" }}
                gifts={gifts}
                compact
                align="left"
                onStart={onStart}
              />
            )}
          />
        </div>
        <div className="hidden h-full md:block"><EditorialDesktop palette={palette} theme={theme} start={start} siteTitle={siteTitle} content={editorialCopy} /></div>
      </div>
    );
  }
  if (start.layout === "spotlight_center") {
    return (
      <Stage palette={palette} theme={theme} start={start} compact={compact} vignette>
        <div className={`relative z-10 flex h-full flex-col justify-center ${compact ? "px-5 py-6" : "px-6 py-8"}`}>
          <div className="mx-auto w-full max-w-2xl">{copy}</div>
        </div>
        <Trust start={start} className={compact ? "left-1/2 top-4 -translate-x-1/2" : "left-1/2 top-6 -translate-x-1/2"} dark={overMedia || theme.preset === "dark_premium"} />
      </Stage>
    );
  }
  if (start.layout === "swiss_minimal") {
    return (
      <div className="relative flex h-full min-h-0 flex-col justify-center overflow-hidden" style={{ background: palette.bg, color: palette.fg, fontFamily: palette.font }}>
        <div className={`mx-auto flex w-full max-w-3xl flex-col ${compact ? "px-5 py-6" : "px-10 py-8"}`}>
          <div className="mb-5 h-px w-12" style={{ background: palette.fg }} />
          {copy}
        </div>
        <Trust start={start} className={compact ? "right-4 top-4" : "right-8 top-8"} dark={theme.preset === "dark_premium"} />
      </div>
    );
  }
  return (
    <Stage palette={palette} theme={theme} start={start} compact={compact}>
      <div className={`relative z-10 flex h-full min-h-0 flex-col justify-center ${compact ? "px-5 py-6" : "px-8 py-8 md:px-12"}`}>
        <div className={compact ? "w-full" : "max-w-3xl"}>{copy}</div>
      </div>
      <Trust start={start} className={compact ? "right-4 top-4" : "right-8 top-7"} dark={overMedia || theme.preset === "dark_premium"} />
    </Stage>
  );
}

function EditorialDesktop({
  palette,
  theme,
  start,
  siteTitle,
  content,
}: {
  palette: QuizPalette;
  theme: ThemeConfig;
  start: QuizSchema["startScreen"];
  siteTitle: string;
  content: ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 overflow-hidden" style={{ background: palette.bg, color: palette.fg, fontFamily: palette.font }}>
      <div className="flex min-h-0 flex-col justify-center px-10 py-8">{content}</div>
      <div className="relative min-h-0">
        <Media start={start} theme={theme} />
        <Trust start={start} className="right-5 top-5" dark />
        <BrandMark start={start} theme={theme} siteTitle={siteTitle} className="left-5 top-5" light />
      </div>
    </div>
  );
}

function EditorialMobile({
  palette,
  theme,
  start,
  siteTitle,
  content,
}: {
  palette: QuizPalette;
  theme: ThemeConfig;
  start: QuizSchema["startScreen"];
  siteTitle: string;
  content: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: palette.bg, color: palette.fg, fontFamily: palette.font }}>
      <div className="relative h-[32%] min-h-[140px] shrink-0">
        <Media start={start} theme={theme} />
        <BrandMark start={start} theme={theme} siteTitle={siteTitle} className="left-4 top-4" light />
        <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: `linear-gradient(180deg, transparent, ${palette.bg})` }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-4">{content}</div>
    </div>
  );
}

function Stage({
  palette,
  theme,
  start,
  compact,
  vignette,
  children,
}: {
  palette: QuizPalette;
  theme: ThemeConfig;
  start: QuizSchema["startScreen"];
  compact: boolean;
  vignette?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden" style={{ background: palette.bg, color: palette.fg, fontFamily: palette.font }}>
      <Media start={start} theme={theme} />
      <Scrim start={start} compact={compact} vignette={vignette} fallback={!start.media.url} />
      {children}
    </div>
  );
}

function Media({ start, theme }: { start: QuizSchema["startScreen"]; theme: ThemeConfig }) {
  const position = start.media.focalPoint === "left" ? "30% center" : start.media.focalPoint === "right" ? "72% center" : start.media.focalPoint === "top" ? "center 18%" : "center center";
  if (start.media.url && start.media.type === "video") {
    return <video className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: position }} src={start.media.url} autoPlay muted loop playsInline />;
  }
  if (start.media.url && start.media.type === "image") {
    return <img className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: position }} src={start.media.url} alt="" />;
  }
  return <div className="absolute inset-0" style={{ background: architectural(theme) }} />;
}

function Scrim({
  start,
  compact,
  vignette,
  fallback,
}: {
  start: QuizSchema["startScreen"];
  compact: boolean;
  vignette?: boolean;
  fallback: boolean;
}) {
  if (fallback || start.layout === "swiss_minimal") return null;
  const strength = start.media.overlayOpacity / 100;
  const vertical = `linear-gradient(180deg, rgba(0,0,0,${(strength * 0.2).toFixed(2)}) 0%, rgba(0,0,0,${(strength * 0.55).toFixed(2)}) 42%, rgba(0,0,0,${Math.min(0.9, strength + 0.12).toFixed(2)}) 100%)`;
  const horizontal = `linear-gradient(90deg, rgba(0,0,0,${strength.toFixed(2)}) 0%, rgba(0,0,0,${(strength * 0.62).toFixed(2)}) 42%, rgba(0,0,0,${(strength * 0.18).toFixed(2)}) 100%)`;
  const radial = `radial-gradient(ellipse at center, rgba(0,0,0,${(strength * 0.35).toFixed(2)}) 0%, rgba(0,0,0,${strength.toFixed(2)}) 78%)`;
  if (compact) return <div className="absolute inset-0" style={{ background: vertical }} aria-hidden />;
  return (
    <>
      <div className="absolute inset-0 md:hidden" style={{ background: vertical }} aria-hidden />
      <div className="absolute inset-0 hidden md:block" style={{ background: vignette ? radial : horizontal }} aria-hidden />
    </>
  );
}

function Copy({
  schema,
  theme,
  siteTitle,
  palette,
  tone,
  gifts,
  compact,
  align,
  onStart,
}: {
  schema: QuizSchema;
  theme: ThemeConfig;
  siteTitle: string;
  palette: QuizPalette;
  tone: { fg: string; muted: string; line: string; dark: boolean };
  gifts: QuizGift[];
  compact: boolean;
  align: "left" | "center";
  onStart: () => void;
}) {
  const start = schema.startScreen;
  const centered = align === "center";
  const ink = contrastInk(palette.accent);
  const grid = bulletGrid(start.bullets, compact);
  return (
    <div className={centered ? "text-center" : "text-left"} style={{ color: tone.fg }}>
      {start.layout === "editorial_split" ? null : <BrandMark start={start} theme={theme} siteTitle={siteTitle} className={centered ? "mb-4 justify-center" : "mb-4"} />}
      {start.eyebrow.show && start.eyebrow.text ? (
        <p className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${centered ? "" : ""}`} style={{ color: tone.fg, border: `1px solid ${tone.line}` }}>
          <span>{start.eyebrow.text}</span>
        </p>
      ) : null}
      <h1 className={`font-semibold ${compact ? "mt-3 text-[1.7rem] leading-[1.08]" : "mt-3 text-[clamp(1.75rem,3.4vw,3.5rem)] leading-[1.06]"} tracking-[-0.03em]`}>
        <Headline text={tightenHeadline(start.headline)} style={start.highlightStyle} accent={palette.accent} ink={ink} />
      </h1>
      {start.subheadline.show && start.subheadline.text ? (
        <p className={`mt-3 max-w-xl text-sm leading-6 ${centered ? "mx-auto" : ""} ${compact ? "" : "md:text-base"}`} style={{ color: tone.muted }}>
          <Marks text={start.subheadline.text} />
        </p>
      ) : null}
      {start.bullets.show && start.bullets.items.length > 0 ? (
        <ul className={`mt-4 ${grid ? "grid grid-cols-2 gap-x-4 gap-y-2" : "grid gap-2"} ${centered && !grid ? "mx-auto max-w-md text-left" : ""}`}>
          {start.bullets.items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-2 text-[13px] leading-5">
              <BulletMark item={item} index={index} style={start.bullets.iconStyle} accent={palette.accent} />
              <span><Marks text={item.text} /></span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={`mt-5 ${compact || gifts.length !== 1 || centered ? "grid gap-3" : "grid gap-3 md:flex md:items-center"}`}>
        <button type="button" className={`${compact ? "min-h-[54px] w-full" : "min-h-[54px] w-full justify-self-start md:min-h-[48px] md:w-fit md:px-6"} text-sm font-semibold`} style={{ background: palette.accent, color: ink, borderRadius: palette.radius }} onClick={onStart}>
          <span>{start.ctaText || "Начать"}</span>
        </button>
        {gifts.length === 1 && !centered ? <GiftCard gift={gifts[0]!} dark={tone.dark} locked label={schema.giftsConfig.sectionLabel} /> : null}
      </div>
      {start.ctaMicroText.show && start.ctaMicroText.text ? (
        <p className="mt-2 text-[11px]" style={{ color: tone.muted }}><span>{liveMicro(start.ctaMicroText.text, schema.steps.length)}</span></p>
      ) : null}
      {gifts.length > 1 || (gifts.length === 1 && centered) ? (
        <div className={`mt-3 ${compact ? "grid gap-2" : gifts.length > 2 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}`}>
          {gifts.map((gift) => <GiftCard key={gift.id} gift={gift} dark={tone.dark} locked label={schema.giftsConfig.sectionLabel} />)}
        </div>
      ) : null}
    </div>
  );
}

function BrandMark({
  start,
  theme,
  siteTitle,
  className,
  light,
}: {
  start: QuizSchema["startScreen"];
  theme: ThemeConfig;
  siteTitle: string;
  className?: string;
  light?: boolean;
}) {
  if (!start.brand.show) return null;
  const logo = start.brand.logoUrl || theme.logoUrl;
  const name = stripMarkers(start.brand.name || siteTitle);
  if (!logo && !name) return null;
  return (
    <div className={`flex items-center gap-2 ${className ?? ""} ${light ? "absolute" : ""}`}>
      {logo ? <img src={logo} alt="" className="h-6 w-auto object-contain" /> : null}
      {name ? <span className="text-xs font-medium tracking-wide" style={light ? { color: "#F4F4F5" } : undefined}>{name}</span> : null}
    </div>
  );
}

function Trust({ start, className, dark }: { start: QuizSchema["startScreen"]; className: string; dark: boolean }) {
  if (!start.trustBadge.show || !start.trustBadge.primaryText) return null;
  return (
    <div className={`absolute z-20 rounded-full px-3 py-1.5 text-[11px] backdrop-blur-md ${className}`} style={glass(dark)}>
      <Marks text={start.trustBadge.primaryText} />
      {start.trustBadge.secondaryText ? <span style={{ opacity: 0.72 }}><span>{` · `}</span><Marks text={start.trustBadge.secondaryText} /></span> : null}
    </div>
  );
}

export function GiftCard({ gift, dark, locked, action, label }: { gift: QuizGift; dark: boolean; locked?: boolean; action?: boolean; label?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2 backdrop-blur-md" style={glass(dark)}>
      <Cover gift={gift} dark={dark} />
      <div className="min-w-0 flex-1">
        {label ? <p className="mb-1 text-[10px] uppercase tracking-[0.08em] opacity-55"><span>{label}</span></p> : null}
        <p className="truncate text-xs font-medium"><span>{gift.title}</span></p>
        {gift.subtitle ? <p className="truncate text-[11px] opacity-70"><span>{gift.subtitle}</span></p> : null}
        {action ? <GiftAction gift={gift} /> : null}
      </div>
      {locked ? <Lock size={13} strokeWidth={1.5} className="shrink-0 opacity-70" /> : <Unlock size={13} strokeWidth={1.5} className="shrink-0" />}
    </div>
  );
}

function Cover({ gift, dark }: { gift: QuizGift; dark: boolean }) {
  if (gift.coverUrl) return <img src={gift.coverUrl} alt="" className="h-12 w-9 shrink-0 rounded-sm object-cover" />;
  return (
    <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-sm" style={{ background: dark ? "#1A1A1E" : "#F4F1EA", border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(9,9,11,0.10)" }}>
      <div className="absolute inset-x-1.5 top-2 h-px" style={{ background: dark ? "rgba(255,255,255,0.35)" : "rgba(9,9,11,0.25)" }} />
      <div className="absolute inset-x-1.5 top-4 h-px opacity-60" style={{ background: dark ? "rgba(255,255,255,0.35)" : "rgba(9,9,11,0.25)" }} />
      <div className="absolute inset-x-1.5 top-6 h-px opacity-40" style={{ background: dark ? "rgba(255,255,255,0.35)" : "rgba(9,9,11,0.25)" }} />
    </div>
  );
}

function GiftAction({ gift }: { gift: QuizGift }) {
  if (gift.type === "file" && gift.fileUrl) {
    return (
      <a className="mt-1 inline-flex text-[11px] font-medium underline underline-offset-2" href={gift.fileUrl} download={gift.fileName || undefined} target="_blank" rel="noreferrer">
        <span>{gift.actionLabel || "Скачать файл"}</span>
      </a>
    );
  }
  if (gift.type === "link" && gift.actionUrl) {
    return (
      <a className="mt-1 inline-flex text-[11px] font-medium underline underline-offset-2" href={gift.actionUrl} target="_blank" rel="noreferrer">
        <span>{gift.actionLabel || "Открыть каталог"}</span>
      </a>
    );
  }
  return null;
}

export function GiftProgress({ schema, remaining, lead, palette }: { schema: QuizSchema; remaining: number; lead?: boolean; palette: QuizPalette }) {
  const gifts = schema.giftsConfig.items;
  if (!schema.giftsConfig.showInProgress || gifts.length === 0) return null;
  const dark = palette.bg === "#0A0A0C";
  const names = gifts.map((item) => item.title).join(", ");
  return (
    <div className="mb-5 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs" style={{ ...glass(dark), color: palette.fg }}>
      {lead ? <Unlock size={13} strokeWidth={1.5} /> : <Lock size={13} strokeWidth={1.5} />}
      <span>{lead ? `Последний шаг — укажите контакт, чтобы открыть: ${names}` : `Осталось ${stepsLeftLabel(remaining)} до бонуса: ${gifts[0]?.title ?? ""}`}</span>
    </div>
  );
}

export function UnlockedGifts({ schema, palette }: { schema: QuizSchema; palette: QuizPalette }) {
  const gifts = schema.giftsConfig.items;
  if (!schema.giftsConfig.showOnThankYou || gifts.length === 0) return null;
  const dark = palette.bg === "#0A0A0C";
  return (
    <div className="mt-8">
      <p className="mb-3 flex items-center gap-2 text-xs font-medium" style={{ color: palette.accent }}>
        <Unlock size={14} strokeWidth={1.5} />
        <span>Доступ открыт</span>
      </p>
      <div className="grid gap-2">
          {gifts.map((gift) => <GiftCard key={gift.id} gift={gift} dark={dark} action />)}
      </div>
    </div>
  );
}

function BulletMark({ item, index, style, accent }: { item: StartBullet; index: number; style: QuizSchema["startScreen"]["bullets"]["iconStyle"]; accent: string }) {
  if (style === "number") return <span className="mt-0.5 w-4 shrink-0 text-xs font-semibold" style={{ color: accent }}>{index + 1}</span>;
  const Icon = style === "icon" ? ICONS[(item.icon as keyof typeof ICONS) ?? "check"] ?? Check : Check;
  return <Icon size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" color={accent} />;
}

function Headline({ text, style, accent, ink }: { text: string; style: QuizSchema["startScreen"]["highlightStyle"]; accent: string; ink: string }) {
  const parts = text.split(/(==[^=]+==)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        const marked = part.startsWith("==") && part.endsWith("==");
        const value = marked ? part.slice(2, -2) : part;
        if (!marked) return <span key={index}>{value}</span>;
        if (style === "accent_text") return <span key={index} style={{ color: accent }}>{value}</span>;
        if (style === "underline") return <span key={index} style={{ boxShadow: `inset 0 -0.12em 0 ${accent}` }}>{value}</span>;
        return <span key={index} className="box-decoration-clone rounded-lg px-2.5 py-0.5" style={{ background: accent, color: ink, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{value}</span>;
      })}
    </>
  );
}

function Marks({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}
    </>
  );
}

function bulletGrid(bullets: QuizSchema["startScreen"]["bullets"], compact: boolean) {
  if (compact || bullets.layout === "stack") return false;
  if (bullets.layout === "grid_2") return true;
  return bullets.items.length === 4 && bullets.items.every((item) => item.text.length <= 72);
}

function glass(dark: boolean): CSSProperties {
  return dark
    ? { background: "rgba(10,10,12,0.46)", border: "1px solid rgba(255,255,255,0.12)", color: "#F4F4F5" }
    : { background: "rgba(255,255,255,0.74)", border: "1px solid rgba(9,9,11,0.10)", color: "#09090B" };
}

function liveMicro(text: string, count: number) {
  return text.replace(/\d+\s*вопрос(?:а|ов)?/i, questionPhrase(count));
}

function architectural(theme: ThemeConfig) {
  const accent = theme.accentColor || "#cf0234";
  if (theme.preset === "light_minimal") return `radial-gradient(ellipse at 78% 0%, ${accent}18, transparent 46%), #F7F7F8`;
  if (theme.preset === "editorial_warm") return `radial-gradient(ellipse at 80% 0%, ${accent}24, transparent 42%), radial-gradient(ellipse at 50% 120%, rgba(28,25,23,0.05), transparent 50%), #F6F4F0`;
  return `radial-gradient(ellipse at 82% 0%, ${accent}1A, transparent 42%), radial-gradient(ellipse at 50% 110%, rgba(255,255,255,0.05), transparent 48%), #0B0B0E`;
}
