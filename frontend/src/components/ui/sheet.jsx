import { cn } from "cn"
import { Dialog as SheetPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({
  ...props
}) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetPortal({
  ...props
}) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetClose({
  ...props
}) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 isolate z-(--z-overlay) bg-black/20 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// Slides in from the right, full-height — a profile/settings panel that
// doesn't take over the whole screen like a centered Dialog would.
function SheetContent({
  className,
  children,
  showCloseButton = true,
  lightBackdrop = false,
  ...props
}) {
  return (
    <SheetPortal>
      {lightBackdrop ? (
        // A plain backdrop for a NON-MODAL sheet (see ProfilePanel): Radix only renders
        // its Overlay for modal dialogs. Tapping it closes the sheet (a Close, so it
        // doesn't depend on Radix's outside-click detection, which on touch waits for a
        // synthesized click), and touch-none stops a drag on it from scrolling the page.
        <SheetPrimitive.Close asChild>
          <div
            data-slot="sheet-overlay"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-(--z-overlay) touch-none bg-black/20 animate-in fade-in-0 duration-200"
          />
        </SheetPrimitive.Close>
      ) : (
        <SheetOverlay />
      )}
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-(--z-overlay) flex h-full w-full max-w-sm flex-col border-l bg-popover text-sm text-popover-foreground shadow-lg outline-none duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
          className
        )}
        {...props}
      >
        {/* Scrolls on its own — the close button below stays pinned to the panel
            itself, not to this scrolling body (a taller-than-viewport panel, e.g.
            after revealing a recovery code, used to push content below the fold
            with no way to scroll to it). */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
          {children}
        </div>
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 pr-8", className)}
      {...props}
    />
  )
}

function SheetFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
