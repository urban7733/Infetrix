import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/20 text-primary",
        secondary: "border-border/70 bg-secondary/60 text-secondary-foreground",
        success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
        warning: "border-amber-400/30 bg-amber-500/15 text-amber-200",
        destructive: "border-rose-400/30 bg-rose-500/15 text-rose-200",
        outline: "text-foreground border-border/80",
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
