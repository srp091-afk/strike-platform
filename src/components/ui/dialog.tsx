import * as React from "react";

import { cn } from "@/lib/utils";

function DialogContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-slot="dialog-content"
      className={cn("m-0 h-screen w-screen max-w-none rounded-none bg-zinc-50", className)}
      {...props}
    />
  );
}

export { DialogContent };
