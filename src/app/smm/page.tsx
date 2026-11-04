import type { Metadata } from "next";

import { SmmView } from "@/components/smm/smm-view";

export const metadata: Metadata = {
  title: "SMM",
};

export default function SmmPage() {
  return <SmmView />;
}
