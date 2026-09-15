import {Input as InputPrimitive} from "@base-ui/react/input";
import {cn} from "../../lib/utils";

function Input({className, type, ...props}) {
  return <InputPrimitive type={type} data-slot="input" className={cn("input h-9 w-full min-w-0 rounded-3xl border border-input bg-input/40 px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50", className)} {...props} />;
}

export {Input};
