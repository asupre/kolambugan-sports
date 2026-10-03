import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

// NON-modal by default (Oct 2026, phone lag): a modal Radix dialog, as it opens, aria-hides
// the whole page, sets pointer-events:none on <body> and locks scrolling; each of those
// restyles the entire page in the frame the open animation starts (measured ~100ms of a
// ~200ms freeze at 4x CPU on a phone, Season's "move on" dialog). The profile panel already
// works this way. What stays the same: the dark backdrop (our own div below, which also
// catches taps), tapping outside or Escape closes it, focus moves into it. Pass modal to opt
// back in for one dialog.
function Dialog({
  modal = false,
  ...props
}) {
  return <DialogPrimitive.Root data-slot="dialog" modal={modal} {...props} />
}

function DialogTrigger({
  ...props
}) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      // No backdrop-blur: it's one of the most GPU-expensive CSS effects on a
      // phone, and every Dialog on the site uses this overlay — opening the
      // Review Queue's player modal (over a busy page) and then its zoom
      // lightbox (a SECOND dialog stacked on top) meant two blur passes at
      // once. bg-black/30 alone reads as "definitely a modal" without it.
      className={cn(
        "fixed inset-0 isolate z-(--z-overlay) bg-black/30 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// Opening a dialog used to focus its first button straight away, which forces a full layout
// in the same frame the open animation starts: measured ~125ms of a ~200ms freeze on a phone
// (Season's "move on" dialog, Oct 2026). Same fix the profile panel got: skip the instant
// focus and focus the dialog itself once the ~100ms animation is done. A dialog that handles
// its own focus (onOpenAutoFocus calling preventDefault, e.g. the zoom viewer) is left alone;
// an input with autoFocus still gets focus.
function deferredOpenFocus(onOpenAutoFocus) {
  return (e) => {
    onOpenAutoFocus?.(e)
    if (e.defaultPrevented) return
    e.preventDefault()
    const el = e.currentTarget
    setTimeout(() => {
      if (el && el.isConnected && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
    }, 140)
  }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}) {
  const overlayRef = React.useRef(null)
  // Non-modal dialogs treat ANY focus or tap outside as "close", which closed a dialog the
  // moment a second one opened over it (the Review Queue's player popup vanished when its
  // Reject confirmation opened). Close only on a tap on THIS dialog's own backdrop, the
  // same thing the modal version did; Escape still closes the top one.
  const onPointerDownOutside = (e) => {
    if (e.target !== overlayRef.current) e.preventDefault()
  }
  return (
    <DialogPortal>
      {/* Plain backdrop (Radix only draws its Overlay for modal dialogs). A tap on it is
          "outside" the dialog, so it closes it as before. */}
      <div
        ref={overlayRef}
        data-slot="dialog-overlay"
        aria-hidden="true"
        className="fixed inset-0 isolate z-(--z-overlay) touch-none bg-black/30 duration-100 animate-in fade-in-0"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={deferredOpenFocus(onOpenAutoFocus)}
        onPointerDownOutside={onPointerDownOutside}
        onFocusOutside={(e) => e.preventDefault()}
        className={cn(
          "fixed top-1/2 left-1/2 z-(--z-overlay) grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
