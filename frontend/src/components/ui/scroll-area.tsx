import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/utils/cn"

type ScrollAreaVariant = "default" | "white" | "pencil"

function ScrollArea({
  className,
  children,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & { variant?: ScrollAreaVariant }) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar variant={variant} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  variant = "default",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & { variant?: ScrollAreaVariant }) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none h-[100%]!",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      {variant === "pencil" ? (
        <ScrollAreaPrimitive.ScrollAreaThumb
          data-slot="scroll-area-thumb"
          className="relative flex-1 rounded-full cursor-move"
        >
          <div className="triangle"></div>
          <div className="stalk"></div>
          <div className="eraser"></div>
        </ScrollAreaPrimitive.ScrollAreaThumb>
      ) : (
        <ScrollAreaPrimitive.ScrollAreaThumb
          data-slot="scroll-area-thumb"
          className={cn(
            "relative flex-1 rounded-full cursor-move",
            variant === "white" ? "bg-white blur-[1px]" : "bg-black blur-[1px]"
          )}
        />
      )}
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
