import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/30 bg-white/10 text-white",
        secondary: "border-border/70 bg-secondary/60 text-secondary-foreground",
        success: "border-white/30 bg-white/10 text-white",
        warning: "border-white/30 bg-white/10 text-white",
        destructive: "border-white/30 bg-white/10 text-white",
        outline: "text-foreground border-border/80 bg-black/20",
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
