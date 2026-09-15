import {cn} from "../../lib/utils";

function Textarea({className, ...props}) {
  return <textarea data-slot="textarea" className={cn("min-h-16 w-full rounded-3xl border border-input bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50", className)} {...props} />;
}

export {Textarea};
