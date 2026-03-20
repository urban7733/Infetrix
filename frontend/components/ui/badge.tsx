import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/25 bg-white/10 text-white",
        secondary: "border-white/20 bg-black/40 text-zinc-300",
        success: "border-white/25 bg-white/10 text-white",
        warning: "border-white/25 bg-white/10 text-white",
        destructive: "border-white/25 bg-white/10 text-white",
        outline: "border-white/20 bg-black/30 text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
