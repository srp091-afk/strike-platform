import { emptyHelper, type QuizSchema, type QuizStep, type StartBullet } from "@/lib/sites/quiz-schema";

const GENERIC_TITLES = new Set([
  "Какой бюджет вы рассматриваете?",
  "Когда планируете начать?",
  "Что для вас главное?",
]);

export function stripMarkers(value: string) {
  return value.replace(/==/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function tightenHeadline(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("==") && !/^==[\s\S]+==$/.test(trimmed)) return trimmed;
  const inner = trimmed.replace(/^==/, "").replace(/==$/, "").trim();
  const words = inner.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return words.join(" ");
  const digit = words.findIndex((word) => /\d/.test(word));
  const start = digit > 0 ? digit - 1 : Math.max(1, words.length - 3);
  return `${words.slice(0, start).join(" ")} ==${words.slice(start).join(" ")}==`;
}

export function questionPhrase(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "вопрос" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "вопроса" : "вопросов";
  return `${count} ${word}`;
}

export function isGenericQuiz(steps: QuizStep[]) {
  return steps.length < 4 || steps.every((step) => GENERIC_TITLES.has(step.title));
}

export function polishGeneratedQuiz(schema: QuizSchema, prompt: string, rawTitle = ""): { schema: QuizSchema; title: string; subdomainSeed: string; replacedSteps: boolean } {
  const niche = nichePack(prompt);
  const replacedSteps = isGenericQuiz(schema.steps);
  const steps = replacedSteps ? niche.steps : schema.steps;
  const sourceHeadline = schema.startScreen.headline.trim() ? schema.startScreen.headline : niche.headline;
  const headline = tightenHeadline(sourceHeadline);
  const richBullets = schema.startScreen.bullets.items.filter((item) => /\d|\*\*/.test(item.text)).length;
  const bullets = schema.startScreen.bullets.items.length >= 4 && richBullets >= 3 ? schema.startScreen.bullets.items.slice(0, 4) : niche.bullets;
  const sub = schema.startScreen.subheadline.text;
  const weakSub = !sub.trim() || /ответьте на несколько вопросов/i.test(sub);
  const brand = shortBrand(schema.startScreen.brand.name, headline, niche.brand);
  const cleanTitle = stripMarkers(rawTitle).split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || niche.title;
  return {
    replacedSteps,
    title: cleanTitle.slice(0, 80),
    subdomainSeed: niche.slug,
    schema: {
      ...schema,
      steps,
      startScreen: {
        ...schema.startScreen,
        headline,
        highlightStyle: "badge",
        brand: { ...schema.startScreen.brand, show: true, name: brand },
        subheadline: { show: true, text: weakSub ? niche.subheadline : sub },
        bullets: { ...schema.startScreen.bullets, show: true, layout: "auto", items: bullets },
        ctaMicroText: { show: true, text: `${questionPhrase(steps.length)} · займёт 45 сек` },
      },
    },
  };
}

function shortBrand(name: string | undefined, headline: string, fallback: string) {
  const clean = stripMarkers(name || "");
  const words = clean.split(/\s+/).filter(Boolean);
  if (!clean || words.length > 3 || clean === stripMarkers(headline)) return fallback;
  return words.slice(0, 3).join(" ");
}

type Pack = { title: string; slug: string; brand: string; headline: string; subheadline: string; bullets: StartBullet[]; steps: QuizStep[] };

function nichePack(prompt: string): Pack {
  const text = prompt.toLowerCase();
  if (/ремонт|отделк|строител/.test(text)) return renovation();
  if (/авто|машин|пригон/.test(text)) return auto();
  if (/стомат|клиник|имплант|винир/.test(text)) return clinic();
  if (/аудит|агентств|b2b|заявк|реклам/.test(text)) return audit();
  if (/недвиж|вилл|квартир|апартамент|бали|дуба/.test(text)) return realty();
  return realty();
}

function renovation(): Pack {
  return {
    title: "Студия ремонта",
    slug: "remont-pod-klyuch",
    brand: "Студия ремонта",
    headline: "Ремонт под ключ ==от 18 000 ₽/м²==",
    subheadline: "Смета по этапам до звонка. Срок и состав работ видны сразу.",
    bullets: [
      bullet("b1", "Черновая смета за **1 день**"),
      bullet("b2", "Срок работ от **45 дней**"),
      bullet("b3", "Фиксируем состав до старта"),
      bullet("b4", "Чек-лист скрытых ошибок в подарок"),
    ],
    steps: [
      slider("area", 0, "Какая площадь помещения?", "м²", 20, 180, 5, 60),
      choice("room", 1, "Какой тип помещения?", "room", ["Квартира", "Дом", "Офис", "Коммерция"], [1, 1.15, 1.25, 1.3]),
      choice("finish", 2, "Какой уровень отделки нужен?", "finish", ["Комфорт", "Бизнес", "Премиум"], [18000, 28000, 45000]),
      choice("start", 3, "Когда готовы начать работы?", "start_week", ["В этом месяце", "В этом квартале", "Пока считаю"], [4, 12, 24]),
    ],
  };
}

function realty(): Pack {
  return {
    title: "Подбор вилл",
    slug: "podbor-vill",
    brand: "Bali Villas",
    headline: "Виллы с доходностью ==от 12% годовых==",
    subheadline: "Считаем вход и доход по вашему бюджету. Закрытые лоты откроем после контакта.",
    bullets: [
      bullet("b1", "Подбор за **24 часа**"),
      bullet("b2", "Доходность от **12%**"),
      bullet("b3", "Проверенные объекты"),
      bullet("b4", "PDF-каталог в подарок"),
    ],
    steps: [
      choice("budget", 0, "Какой бюджет на покупку?", "budget", ["До 150 тыс. $", "150–300 тыс. $", "300–600 тыс. $", "От 600 тыс. $"], [120000, 220000, 450000, 800000]),
      choice("goal", 1, "Какая цель покупки?", "goal", ["Для жизни", "Сдача в аренду", "Перепродажа"], [1, 2, 3]),
      choice("format", 2, "Какой формат объекта?", "format", ["Апартаменты", "Вилла", "Таунхаус"], [1, 2, 1.4]),
      choice("when", 3, "Когда планируете покупку?", "timing", ["В этом месяце", "В этом квартале", "Сравниваю"], [1, 2, 3]),
    ],
  };
}

function auto(): Pack {
  return {
    title: "Подбор авто",
    slug: "podbor-avto",
    brand: "Подбор авто",
    headline: "Авто под ключ ==с проверкой лота==",
    subheadline: "Ориентир цены и короткий список лотов до созвона.",
    bullets: [
      bullet("b1", "Проверка по **50** пунктам"),
      bullet("b2", "Ответ за **1 день**"),
      bullet("b3", "Цена с доставкой"),
      bullet("b4", "Чек-лист проверки в подарок"),
    ],
    steps: [
      choice("budget", 0, "Какой бюджет на авто?", "budget", ["До 1,5 млн", "1,5–3 млн", "3–6 млн", "От 6 млн"], [1200000, 2200000, 4500000, 7000000]),
      choice("body", 1, "Какой тип кузова?", "body", ["Седан", "Кроссовер", "Минивэн"], [1, 2, 3]),
      choice("priority", 2, "Что важнее всего?", "priority", ["Цена", "Надёжность", "Комплектация"], [1, 2, 3]),
      choice("when", 3, "Когда нужно авто?", "timing", ["В этом месяце", "В этом квартале", "Не срочно"], [1, 2, 3]),
    ],
  };
}

function clinic(): Pack {
  return {
    title: "Клиника",
    slug: "clinic-implant",
    brand: "Клиника",
    headline: "Имплантация ==с планом и вилкой цены==",
    subheadline: "Предварительный план лечения до визита. Диагностику не продаём вслепую.",
    bullets: [
      bullet("b1", "План за **1 визит**"),
      bullet("b2", "Вилка цены сразу"),
      bullet("b3", "Срок от **3 месяцев**"),
      bullet("b4", "3D-диагностика в подарок"),
    ],
    steps: [
      choice("task", 0, "Какая задача лечения?", "task", ["Имплантация", "Виниры", "Полное восстановление"], [1, 2, 3]),
      choice("units", 1, "Сколько единиц нужно?", "units", ["1", "2–4", "5 и больше"], [1, 3, 6]),
      choice("when", 2, "Когда хотите начать?", "timing", ["На этой неделе", "В этом месяце", "Пока выбираю"], [1, 2, 3]),
      choice("budget", 3, "Какой ориентир по бюджету?", "budget", ["До 150 тыс.", "150–400 тыс.", "От 400 тыс."], [120000, 280000, 500000]),
    ],
  };
}

function audit(): Pack {
  return {
    title: "Аудит заявок",
    slug: "audit-zayavok",
    brand: "Аудит заявок",
    headline: "Прогноз заявок ==по вашему бюджету==",
    subheadline: "Считаем лиды и CPL до созвона. План роста отдаём после контакта.",
    bullets: [
      bullet("b1", "Ориентир CPL сразу"),
      bullet("b2", "Прогноз лидов в месяц"),
      bullet("b3", "Разбор канала"),
      bullet("b4", "План роста в подарок"),
    ],
    steps: [
      choice("budget", 0, "Какой рекламный бюджет в месяц?", "ad_spend", ["До 150 тыс.", "150–400 тыс.", "400 тыс.–1 млн", "От 1 млн"], [100000, 250000, 700000, 1500000]),
      choice("niche", 1, "Какая ниша?", "niche", ["Услуги", "Недвижимость", "Товарка", "B2B"], [1, 2, 3, 4]),
      choice("channel", 2, "Откуда сейчас идут заявки?", "channel", ["Реклама", "Сарафан", "Пока нет потока"], [1, 2, 3]),
      choice("goal", 3, "Сколько заявок нужно в месяц?", "leads", ["До 30", "30–100", "Больше 100"], [20, 60, 150]),
    ],
  };
}

function choice(id: string, order: number, title: string, key: string, labels: string[], values: number[]): QuizStep {
  return {
    id,
    order,
    title,
    subtitle: "",
    required: true,
    type: "single_choice",
    options: labels.map((label, index) => ({
      id: `${id}-${index + 1}`,
      label,
      description: "",
      imageUrl: "",
      nextStepId: null,
      priceImpact: 0,
      numericValue: values[index] ?? 0,
    })),
    sliderConfig: { min: 0, max: 100, step: 1, unit: "", defaultValue: 20 },
    placeholder: "",
    expertTip: "",
    helper: { ...emptyHelper(), enabled: true, text: "" },
    variableKey: key,
    defaultNumericValue: values[Math.floor(values.length / 2)] ?? 0,
  };
}

function slider(id: string, order: number, title: string, unit: string, min: number, max: number, step: number, value: number): QuizStep {
  return {
    ...choice(id, order, title, id, [], []),
    type: "range_slider",
    options: [],
    sliderConfig: { min, max, step, unit, defaultValue: value },
    defaultNumericValue: value,
  };
}

function bullet(id: string, text: string): StartBullet {
  return { id, text, icon: "check" };
}
