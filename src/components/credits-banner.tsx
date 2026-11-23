import { CREDITS_EMPTY_MESSAGE } from "@/lib/credits-policy";

export function CreditsBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
      {CREDITS_EMPTY_MESSAGE}
    </p>
  );
}
