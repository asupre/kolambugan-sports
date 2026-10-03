import * as React from "react"
import { cn } from "cn"

// Calm look (Super Admin): a card WITH a title is a page "section" and its content may or may
// not already be a list/table. That used to be worked out in CSS with :has(), which made every
// style recalculation re-check the whole page (measured: opening a dropdown froze ~400ms at 4x
// CPU). Now each card checks its own direct children once per render and stamps a plain
// attribute (data-section / data-bare) that the CSS matches cheaply. Same result, no :has().
function useMergedRef(ref, check) {
  const local = React.useRef(null)
  React.useLayoutEffect(() => { if (local.current) check(local.current) })
  return React.useCallback((node) => {
    local.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref])
}

const markSection = (el) =>
  el.toggleAttribute("data-section", !!el.querySelector(':scope > [data-slot="card-header"]'))

// "Bare" content is already a box (a list, a table, a grid): it shouldn't get another box.
const BARE = ':scope > table, :scope > div > table, :scope > .overflow-x-auto, :scope > .divide-y:not([data-slot]), :scope > .rounded-lg.border:not([data-slot]), :scope > .grid:not([data-slot])'
const markBare = (el) => el.toggleAttribute("data-bare", !!el.querySelector(BARE))

function Card({
  className,
  size = "default",
  ref,
  ...props
}) {
  const setRef = useMergedRef(ref, markSection)
  return (
    <div
      ref={setRef}
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({
  className,
  ref,
  ...props
}) {
  const setRef = useMergedRef(ref, markBare)
  return (
    <div
      ref={setRef}
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
