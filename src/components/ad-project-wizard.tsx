"use client";

import { Clock } from "lucide-react";
import { useActionState, useState } from "react";

import { createAdProject, type CreateAdProjectState } from "@/actions/ads-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const initialState: CreateAdProjectState = { error: null };

export function AdProjectWizard() {
  const [state, action, pending] = useActionState(createAdProject, initialState);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [format, setFormat] = useState("brief");
  const [localError, setLocalError] = useState<string | null>(null);
  const error = localError || state.error;

  function goNext() {
    if (!name.trim() || !niche.trim()) {
      setLocalError("Заполните название проекта и нишу.");
      return;
    }
    setLocalError(null);
    setStep(2);
  }

  return (
    <form action={action} className="mx-auto grid max-w-2xl gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Проект не создан</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Шаг {step} из 2</p>
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-strike" />
            <span className={`h-1.5 w-10 rounded-full ${step === 2 ? "bg-strike" : "bg-zinc-200"}`} />
          </div>
        </div>

        {step === 1 ? (
          <div className="grid gap-5">
            <label className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Название проекта</span>
              <Input
                name="name"
                value={name}
                placeholder="Кампания для оконной компании"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Ниша</span>
              <Input
                name="niche"
                value={niche}
                placeholder="Пластиковые окна"
                onChange={(event) => setNiche(event.target.value)}
              />
            </label>
            <div className="flex justify-end">
              <Button type="button" onClick={goNext}>
                Далее
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="niche" value={niche} />
            <input type="hidden" name="format" value={format} />
            <div className="grid gap-1">
              <h2 className="font-heading text-lg font-semibold text-zinc-900">Формат брифа</h2>
              <p className="text-sm leading-6 text-zinc-500">
                {name} · {niche}
              </p>
            </div>
            <Tabs value={format} onValueChange={setFormat}>
              <TabsList>
                <TabsTrigger value="brief">Пройти AI-бриф</TabsTrigger>
                <TabsTrigger value="table">Загрузить готовую таблицу</TabsTrigger>
              </TabsList>
              <TabsContent value="brief" className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-800">Свободное описание</p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
                    <Clock className="size-3.5" strokeWidth={2} />
                    Займет 5-7 минут
                  </span>
                </div>
                <Textarea
                  name="brief"
                  placeholder="Просто опишите ваш продукт, чем он крут и кто ваш идеальный клиент, а наш ИИ сам всё структурирует и вытащит нужные смыслы..."
                />
              </TabsContent>
              <TabsContent value="table" className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Файл .xlsx или .csv</span>
                <Input
                  name="file"
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                />
              </TabsContent>
            </Tabs>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep(1)}>
                Назад
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Проверяем бриф" : "Создать проект"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </form>
  );
}
