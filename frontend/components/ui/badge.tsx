import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/35 bg-primary/15 text-primary",
        secondary: "border-white/10 bg-white/[0.06] text-muted-foreground",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        destructive: "border-red-500/30 bg-red-500/10 text-red-300",
        outline: "border-white/10 bg-transparent text-muted-foreground",
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
