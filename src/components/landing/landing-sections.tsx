"use client";

import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Factory,
  Handshake,
  Mail,
  Plug,
  RefreshCw,
  ShoppingBag,
  Target,
  TrendingUp,
  Truck,
  Zap,
  BookOpenText,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { GlowCard, Reveal } from "@/components/landing/landing-ui";
import { cn } from "@/lib/utils";

export type SectionsLang = "RU" | "EN";

const CONTENT = {
  RU: {
    features: {
      title: "Вы спите. Ваши менеджеры спят. STRIKE — закрывает сделки.",
      subtitle:
        "Хватит сливать рекламный бюджет на лидов, которым отвечают через 3 часа. Внедрите AI-агента, который работает 24/7/365, не просит повышения и не уходит в отпуск.",
      cards: [
        {
          title: "Квалификация",
          desc: "AI сам задаст нужные вопросы, мягко отсеет тех, кто «просто спросить», и передаст менеджеру только целевых клиентов с бюджетом.",
        },
        {
          title: "Безжалостные Follow-up",
          desc: "Клиент прочитал и замолчал? STRIKE автоматически, мягко и нативно напомнит о себе и вернет его в диалог. На языке клиента.",
        },
        {
          title: "Мгновенные ответы",
          desc: "Скорость решает. Агент отвечает за 3 секунды в WhatsApp, Telegram или на сайте. Конкуренты просто не успеют перехватить клиента.",
        },
        {
          title: "Бесшовный перехват",
          desc: "AI зашел в тупик или лид готов платить? Бот замолкает, и живой человек бесшовно перехватывает чат в один клик.",
        },
      ],
    },
    how: {
      title: "От запуска до первых лидов — минуты.",
      subtitle: "Никаких сложных интеграций и программистов. Вы справитесь быстрее, чем допьете свой кофе.",
      step: "Шаг",
      steps: [
        {
          title: "Подключите каналы",
          desc: "Подвяжите ваш WhatsApp или Telegram в пару кликов без \"танцев с бубном\".",
        },
        {
          title: "Скормите базу знаний",
          desc: "Просто дайте агенту ссылку на ваш сайт или загрузите PDF. Он выучит всё о вашем бизнесе за 10 секунд.",
        },
        {
          title: "Считайте прибыль",
          desc: "Запустите трафик. Наблюдайте, как AI квалифицирует заявки и назначает вам звонки.",
        },
      ],
    },
    cases: {
      title: "Машина по генерации денег для сложных ниш.",
      items: [
        {
          title: "Строительные компании",
          desc: "Узнает наличие участка, желаемую площадь, уточнит бюджет на стройку и запишет клиента на встречу с архитектором.",
        },
        {
          title: "Логистика",
          desc: "Рассчитает предварительную стоимость фрахта по габаритам, проверит статус груза и соберет заявку на перевозку в 3 часа ночи.",
        },
        {
          title: "Производства и B2B",
          desc: "Ответит на сложные технические вопросы по ГОСТам и спецификациям, рассчитает оптовую цену партии и квалифицирует закупщика.",
        },
        {
          title: "Сфера услуг и E-commerce",
          desc: "Поможет выбрать нужную услугу, «дожмет» брошенную корзину и закроет базовые возражения до подключения живого сейлза.",
        },
      ],
    },
    pricing: {
      title: "Платите за результат, а не за воздух.",
      badge: "Лучшая сделка",
      name: "Pay-as-you-go",
      note: "Никаких скрытых подписок",
      from: "От",
      price: "$10",
      desc: "Пополните баланс на любую сумму от $10. Платите только за реальные сообщения AI. Никаких «кровавых» ежемесячных платежей, даже если вы не пользовались платформой. Риск равен нулю.",
      button: "Пополнить и начать",
    },
    faq: {
      title: "Остались сомнения? Развеиваем.",
      items: [
        {
          q: "А что если бот начнет нести бред?",
          a: "STRIKE работает строго по загруженной вами базе знаний. Он не придумывает факты и не импровизирует с ценами. Если он не знает ответ, он вежливо переведет диалог на оператора.",
        },
        {
          q: "Будет ли видно, что это бот?",
          a: "Вы сами задаете Tone of Voice. Агент может общаться как корпоративный менеджер или как ваш лучший друг, использовать эмодзи и выдерживать естественные паузы.",
        },
        {
          q: "Нужны ли навыки программирования?",
          a: "Абсолютно нет. Интерфейс создан для предпринимателей, а не для гиков.",
        },
      ],
    },
    footer: {
      contacts: "Контакты",
      rights: "© STRIKE. Все права защищены.",
    },
  },
  EN: {
    features: {
      title: "You sleep. Your managers sleep. STRIKE closes deals.",
      subtitle:
        "Stop burning ad budget on leads who get a reply 3 hours later. Deploy an AI agent that works 24/7/365, never asks for a raise and never goes on vacation.",
      cards: [
        {
          title: "Qualification",
          desc: "The AI asks the right questions, gently filters out the \"just asking\" crowd and hands your manager only qualified clients with a budget.",
        },
        {
          title: "Relentless follow-ups",
          desc: "Client read your message and went silent? STRIKE reminds them softly and naturally and brings them back into the conversation. In the client's language.",
        },
        {
          title: "Instant replies",
          desc: "Speed wins. The agent replies in 3 seconds on WhatsApp, Telegram or your website. Competitors simply won't have time to intercept the client.",
        },
        {
          title: "Seamless handoff",
          desc: "AI hit a wall, or the lead is ready to pay? The bot goes quiet and a real person takes over the chat in one click.",
        },
      ],
    },
    how: {
      title: "From launch to your first leads — in minutes.",
      subtitle: "No complex integrations and no developers. You'll finish faster than your coffee.",
      step: "Step",
      steps: [
        {
          title: "Connect your channels",
          desc: "Link your WhatsApp or Telegram in a couple of clicks, no hassle.",
        },
        {
          title: "Feed the knowledge base",
          desc: "Just give the agent a link to your website or upload a PDF. It learns everything about your business in 10 seconds.",
        },
        {
          title: "Count the profit",
          desc: "Launch your traffic. Watch the AI qualify leads and book calls for you.",
        },
      ],
    },
    cases: {
      title: "A money-making machine for complex niches.",
      items: [
        {
          title: "Construction companies",
          desc: "Finds out whether the client owns a plot, the desired area and the build budget, then books a meeting with the architect.",
        },
        {
          title: "Logistics",
          desc: "Calculates a preliminary freight price from cargo dimensions, checks shipment status and collects a transport request at 3 a.m.",
        },
        {
          title: "Manufacturing & B2B",
          desc: "Answers complex technical questions on standards and specifications, calculates the wholesale price of a batch and qualifies the buyer.",
        },
        {
          title: "Services & E-commerce",
          desc: "Helps pick the right service, wins back abandoned carts and handles basic objections before a live salesperson steps in.",
        },
      ],
    },
    pricing: {
      title: "Pay for results, not for air.",
      badge: "Best deal",
      name: "Pay-as-you-go",
      note: "No hidden subscriptions",
      from: "From",
      price: "$10",
      desc: "Top up your balance with any amount from $10. Pay only for real AI messages. No monthly bills, even if you didn't use the platform. Zero risk.",
      button: "Top up and start",
    },
    faq: {
      title: "Still have doubts? Let's clear them up.",
      items: [
        {
          q: "What if the bot starts talking nonsense?",
          a: "STRIKE works strictly from the knowledge base you upload. It doesn't invent facts or improvise prices. If it doesn't know the answer, it politely hands the conversation to an operator.",
        },
        {
          q: "Will people be able to tell it's a bot?",
          a: "You set the Tone of Voice yourself. The agent can talk like a corporate manager or like your best friend, use emojis and keep natural pauses.",
        },
        {
          q: "Do I need programming skills?",
          a: "Absolutely not. The interface is built for entrepreneurs, not geeks.",
        },
      ],
    },
    footer: {
      contacts: "Contacts",
      rights: "© STRIKE. All rights reserved.",
    },
  },
} as const;

export const SUPPORT_EMAIL = "support@strikeplatform.io";

/** Юридические реквизиты — одинаковы для всех языков. */
export const COMPANY_LEGAL =
  "STRIKE Platform. Individual Entrepreneur SIARHEI PASHKO. Identification Number: 304691741. Legal Address: Georgia, Tbilisi, Krtsanisi district, Fonichala settlement 3, building 5, hall 2, floor 4.. All rights reserved.";

const FEATURE_ICONS: LucideIcon[] = [Target, RefreshCw, Zap, Handshake];
const STEP_ICONS: LucideIcon[] = [Plug, BookOpenText, TrendingUp];
const CASE_ICONS: LucideIcon[] = [Building2, Truck, Factory, ShoppingBag];

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <h2 className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text pb-1 text-3xl leading-tight font-semibold tracking-tight text-balance text-transparent sm:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">{subtitle}</p> : null}
    </Reveal>
  );
}

function Section({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
      {children}
    </section>
  );
}

export function LandingSections({ lang, onStart }: { lang: SectionsLang; onStart: () => void }) {
  const t = CONTENT[lang];

  return (
    <>
      <Section id="features">
        <SectionHeading title={t.features.title} subtitle={t.features.subtitle} />
        <div className="mt-12 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.features.cards.map((card, index) => {
            const Icon = FEATURE_ICONS[index]!;
            return (
              <Reveal key={card.title} delay={index * 100} className="h-full">
                <GlowCard icon={<Icon className="size-5" strokeWidth={1.75} />} title={card.title} desc={card.desc} />
              </Reveal>
            );
          })}
        </div>
      </Section>

      <Section id="how-it-works">
        <SectionHeading title={t.how.title} subtitle={t.how.subtitle} />
        <div className="relative mt-12 grid gap-5 md:grid-cols-3">
          <span
            aria-hidden
            className="pointer-events-none absolute top-[3.25rem] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block"
          />
          {t.how.steps.map((step, index) => {
            const Icon = STEP_ICONS[index]!;
            return (
              <Reveal key={step.title} delay={index * 120} className="h-full">
                <GlowCard accent="strike">
                  <div className="relative flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl border border-strike/25 bg-strike/10 text-strike-soft shadow-[0_0_24px_-6px_rgba(207,2,52,0.7)]">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="bg-gradient-to-b from-white/40 to-white/5 bg-clip-text text-5xl font-semibold text-transparent tabular-nums">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="relative mt-6 text-[10px] font-semibold tracking-widest text-strike-soft uppercase">
                    {t.how.step} {index + 1}
                  </p>
                  <h3 className="relative mt-1 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="relative mt-2 text-sm leading-6 text-zinc-400">{step.desc}</p>
                </GlowCard>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <Section id="use-cases">
        <SectionHeading title={t.cases.title} />
        <div className="mt-12 grid items-stretch gap-5 sm:grid-cols-2">
          {t.cases.items.map((item, index) => {
            const Icon = CASE_ICONS[index]!;
            return (
              <Reveal key={item.title} delay={(index % 2) * 100} className="h-full">
                <GlowCard icon={<Icon className="size-5" strokeWidth={1.75} />} title={item.title} desc={item.desc} />
              </Reveal>
            );
          })}
        </div>
      </Section>

      <Section id="pricing-offer">
        <SectionHeading title={t.pricing.title} />
        <Reveal className="mx-auto mt-12 max-w-2xl">
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(207,2,52,0.28),transparent_70%)] blur-2xl"
            />
            <div className="rounded-2xl bg-gradient-to-b from-strike-soft via-strike/60 to-white/10 p-px shadow-[0_0_60px_-12px_rgba(207,2,52,0.55)]">
              <div className="relative overflow-hidden rounded-[15px] bg-[#0a0a0a] p-7 sm:p-10">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(207,2,52,0.18),transparent)]"
                />
                <span className="relative inline-flex items-center gap-1.5 rounded-full border border-strike/30 bg-strike/10 px-3 py-1 text-xs font-medium text-strike-soft">
                  <Zap className="size-3.5" strokeWidth={2} />
                  {t.pricing.badge}
                </span>
                <h3 className="relative mt-5 text-2xl font-semibold text-white sm:text-3xl">{t.pricing.name}</h3>
                <p className="relative mt-1 text-sm text-zinc-400">({t.pricing.note})</p>
                <p className="relative mt-6 flex items-baseline gap-2">
                  <span className="text-sm text-zinc-400">{t.pricing.from}</span>
                  <span className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-6xl font-semibold tracking-tight text-transparent">
                    {t.pricing.price}
                  </span>
                </p>
                <div className="relative mt-6 flex items-start gap-3">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-strike/15 text-strike-soft">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <p className="text-base leading-7 text-zinc-300">{t.pricing.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={onStart}
                  className="group relative mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_30px_-6px_rgba(207,2,52,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(207,2,52,0.8)] active:scale-[0.98]"
                >
                  {t.pricing.button}
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section id="faq">
        <SectionHeading title={t.faq.title} />
        <Reveal className="mx-auto mt-12 max-w-3xl">
          <Faq items={t.faq.items} />
        </Reveal>
      </Section>
    </>
  );
}

function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="grid gap-3">
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div
            key={item.q}
            className={cn(
              "overflow-hidden rounded-2xl border bg-white/[0.03] backdrop-blur-xl transition-colors duration-300",
              isOpen ? "border-white/25 shadow-[0_0_40px_-16px_rgba(129,140,248,0.5)]" : "border-white/10 hover:border-white/20",
            )}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
            >
              <span className="text-base font-semibold text-white">{item.q}</span>
              <ChevronDown
                className={cn("size-5 shrink-0 text-zinc-400 transition-transform duration-300", isOpen && "rotate-180 text-white")}
                strokeWidth={2}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-6 text-zinc-400 sm:px-6 sm:text-base sm:leading-7">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Блок «Контакты» и юридический копирайт для футера. */
export function LandingFooterExtras({ lang, children }: { lang: SectionsLang; children?: ReactNode }) {
  const t = CONTENT[lang].footer;
  return (
    <>
      <div className="mx-auto mb-6 flex max-w-6xl flex-col items-center gap-2 px-4">
        <h3 className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">{t.contacts}</h3>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-300 transition-colors hover:text-white"
        >
          <Mail className="size-4" strokeWidth={1.75} />
          {SUPPORT_EMAIL}
        </a>
      </div>
      {children}
      <p className="mx-auto mt-4 max-w-3xl px-4 text-[11px] leading-5 text-zinc-600">{COMPANY_LEGAL}</p>
    </>
  );
}
