import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-2xl border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md", className)}
      {...props}
    />
  );
}

export { Card };
