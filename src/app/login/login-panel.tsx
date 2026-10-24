"use client";

import { Loader2, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { GoogleSignInButton } from "@/app/login/google-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Вход: Google OAuth и Magic Link по email (без паролей). Письмо ведёт на
 * /auth/callback, который обменивает code на сессию — тот же маршрут, что и у Google.
 */
export function LoginPanel() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const authCode = searchParams.get("code");

  // Если Supabase вернул code на /login — передаём его в обработчик, чтобы не зависать на экране входа.
  useEffect(() => {
    if (!authCode) return;
    window.location.replace(`/auth/callback?code=${encodeURIComponent(authCode)}&next=/`);
  }, [authCode]);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Введите корректный email.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setSentTo(address);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отправить ссылку.");
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="animate-in py-4 text-center" role="status">
        <span className="mx-auto grid size-14 place-items-center rounded-full border border-white/15 bg-white/5 text-white shadow-[0_0_30px_-6px_rgba(255,255,255,0.35)]">
          <Mail className="size-6" strokeWidth={1.75} />
        </span>
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          Ссылка с доступом отправлена на <span className="font-semibold break-all text-white">{sentTo}</span>.
          Проверьте почту, чтобы войти в платформу.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="mt-5 text-xs text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-300"
        >
          Использовать другой email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {callbackError ? (
        <p className="rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {callbackError === "no_code" ? "Ссылка недействительна или устарела. Запросите новую." : callbackError}
        </p>
      ) : null}

      <GoogleSignInButton />

      <div className="flex items-center gap-3" role="separator" aria-label="или">
        <span className="h-px flex-1 bg-zinc-800" />
        <span className="text-xs uppercase tracking-widest text-zinc-500">или</span>
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <form onSubmit={(event) => void sendMagicLink(event)} className="space-y-3" noValidate>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@company.com"
          aria-label="Email"
          required
          value={email}
          disabled={pending}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          className="h-12 px-4"
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending || !email.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Продолжить
        </Button>
      </form>
    </div>
  );
}
