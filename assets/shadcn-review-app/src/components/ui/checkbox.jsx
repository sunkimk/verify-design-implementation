import {Checkbox as CheckboxPrimitive} from "@base-ui/react/checkbox";
import {HugeiconsIcon} from "@hugeicons/react";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import {cn} from "../../lib/utils";

function Checkbox({className, ...props}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn("peer relative flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-input bg-background transition-shadow outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current [&>svg]:size-3.5"><HugeiconsIcon icon={Tick02Icon} strokeWidth={2.4} aria-hidden="true" /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export {Checkbox};
