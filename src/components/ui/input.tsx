import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 md:h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-base shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm max-md:h-12 max-md:border-transparent max-md:bg-muted/70 max-md:px-4 max-md:shadow-none max-md:focus-visible:bg-background max-md:focus-visible:ring-2 max-md:focus-visible:ring-foreground/20",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
