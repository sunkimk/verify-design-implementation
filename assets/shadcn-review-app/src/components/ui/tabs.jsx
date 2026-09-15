import {Tabs as TabsPrimitive} from "@base-ui/react/tabs";
import {cva} from "class-variance-authority";
import {cn} from "../../lib/utils";

function Tabs({className, ...props}) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("tabs group/tabs flex flex-col gap-2", className)} {...props} />;
}
const tabsListVariants = cva("tabs__list group/tabs-list inline-flex w-fit items-center justify-center rounded-full p-1 text-muted-foreground", {variants: {variant: {default: "bg-muted", line: "gap-1 bg-transparent"}}, defaultVariants: {variant: "default"}});
function TabsList({className, variant = "default", ...props}) {
  return <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({variant}), className)} {...props} />;
}
function TabsTrigger({className, ...props}) {
  return <TabsPrimitive.Tab data-slot="tabs-trigger" className={cn("tabs__tab relative inline-flex flex-1 items-center justify-center rounded-full border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 data-active:bg-background data-active:text-primary data-active:shadow-sm", className)} {...props} />;
}
function TabsContent({className, ...props}) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("flex-1 text-sm outline-none", className)} {...props} />;
}

export {Tabs, TabsList, TabsTrigger, TabsContent};
