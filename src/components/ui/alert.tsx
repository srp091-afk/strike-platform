import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva("relative grid w-full gap-1 rounded-xl border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "border-zinc-200 bg-white text-zinc-900",
      destructive: "border-red-200 bg-red-50 text-red-800",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 data-slot="alert-title" className={cn("font-heading font-semibold tracking-wide", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="alert-description" className={cn("leading-6", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
