"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function GoogleSignInButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signInError) {
        setPending(false);
        setError(signInError.message);
      }
    } catch (caught) {
      setPending(false);
      setError(caught instanceof Error ? caught.message : "Не удалось начать вход.");
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" size="lg" className="w-full" disabled={pending} onClick={signIn}>
        Войти через Google
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
