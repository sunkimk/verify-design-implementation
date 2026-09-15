import {cn} from "../../lib/utils";

function Card({className, ...props}) {
  return <div data-slot="card" className={cn("card group/card flex flex-col overflow-hidden rounded-4xl bg-card text-sm text-card-foreground shadow-md ring-1 ring-foreground/5", className)} {...props} />;
}
function CardHeader({className, ...props}) {
  return <div data-slot="card-header" className={cn("card__header grid auto-rows-min gap-1.5 px-6", className)} {...props} />;
}
function CardTitle({className, ...props}) {
  return <div data-slot="card-title" className={cn("card__title font-heading text-base font-medium", className)} {...props} />;
}
function CardDescription({className, ...props}) {
  return <div data-slot="card-description" className={cn("card__description text-sm text-muted-foreground", className)} {...props} />;
}
function CardContent({className, ...props}) {
  return <div data-slot="card-content" className={cn("card__content px-6", className)} {...props} />;
}
function CardFooter({className, ...props}) {
  return <div data-slot="card-footer" className={cn("card__footer flex items-center px-6", className)} {...props} />;
}

export {Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter};
