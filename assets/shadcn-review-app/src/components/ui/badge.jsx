import {cva} from "class-variance-authority";
import {cn} from "../../lib/utils";

const badgeVariants = cva(
  "chip inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-3xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {variants: {variant: {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    outline: "border-border text-foreground",
    success: "chip--success bg-emerald-50 text-emerald-700",
    warning: "chip--warning bg-amber-50 text-amber-800",
    destructive: "chip--danger bg-destructive/10 text-destructive",
  }}, defaultVariants: {variant: "secondary"}},
);

function Badge({className, variant = "secondary", ...props}) {
  return <span data-slot="badge" className={cn(badgeVariants({variant}), className)} {...props} />;
}

export {Badge, badgeVariants};
