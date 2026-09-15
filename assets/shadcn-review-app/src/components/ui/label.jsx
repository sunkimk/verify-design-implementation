import {cn} from "../../lib/utils";

function Label({className, ...props}) {
  return <label data-slot="label" className={cn("label flex items-center gap-2 text-sm leading-none font-medium select-none", className)} {...props} />;
}

export {Label};
