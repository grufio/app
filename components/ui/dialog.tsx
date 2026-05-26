"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Dialog content variants.
 *
 * - `default`: the centred card (unchanged shadcn behaviour).
 * - `fullscreen`: edge-to-edge sheet for mobile. Owns the viewport math so
 *   callers never hand-roll it: `100dvh` (dynamic viewport, survives the iOS
 *   toolbar), no width cap, no rounding, and `pt-safe`/`pb-safe` so the header
 *   and a sticky footer stay clear of the notch / home indicator. The body is
 *   a `flex flex-col`; callers compose a `shrink-0` header, a `flex-1 min-h-0
 *   overflow-y-auto` body, and an optional `DialogStickyFooter`.
 */
const dialogContentVariants = cva(
  "bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 relative text-sm duration-100 outline-none",
  {
    variants: {
      variant: {
        default: "ring-foreground/10 grid w-full gap-4 rounded-xl p-4 ring-1 sm:max-w-sm",
        fullscreen: "flex h-[100dvh] w-full max-w-none flex-col overflow-hidden pt-safe pb-safe",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function DialogContent({
  className,
  variant = "default",
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
  }) {
  const isFullscreen = variant === "fullscreen"
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      {/* Default: flex-centre the content instead of `-translate-1/2` (a
          percentage translate lands on a half-pixel for odd sizes and blurs
          the subtree). Fullscreen: the content fills the viewport itself, so
          no centring wrapper. */}
      <div
        className={cn(
          "fixed inset-0 z-50",
          !isFullscreen && "flex items-center justify-center p-4"
        )}
      >
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(dialogContentVariants({ variant }), className)}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              data-variant="ghost"
              data-size="icon-sm"
              className={cn(
                "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg absolute right-2",
                // Keep the close button below the notch in fullscreen.
                isFullscreen ? "top-safe-2" : "top-2"
              )}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
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
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end",
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

/**
 * Sticky action bar for the bottom of a fullscreen/scrollable dialog: a
 * `shrink-0` bar with a top border that pins below the scroll region. Children
 * are laid out as a `justify-between` row (e.g. Cancel left, primary right).
 */
function DialogStickyFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-sticky-footer"
      className={cn("flex shrink-0 justify-between gap-2 border-t p-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3", className)}
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
  DialogStickyFooter,
  DialogTitle,
  DialogTrigger,
}
