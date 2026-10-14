import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

import { cn } from 'cnfast';

function TooltipProvider({ delay = 300, closeDelay = 100, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} closeDelay={closeDelay} {...props} />;
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 6,
  align = 'center',
  alignOffset = 0,
  anchor,
  positionMethod = 'fixed',
  collisionBoundary,
  collisionPadding = 8,
  collisionAvoidance,
  sticky,
  children,
  arrow = true,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    | 'align'
    | 'alignOffset'
    | 'side'
    | 'sideOffset'
    | 'anchor'
    | 'positionMethod'
    | 'collisionBoundary'
    | 'collisionPadding'
    | 'collisionAvoidance'
    | 'sticky'
  > & {
    arrow?: boolean;
  }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        anchor={anchor}
        positionMethod={positionMethod}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        collisionAvoidance={collisionAvoidance}
        sticky={sticky}
        className="z-[99999] pointer-events-none"
        style={{ zIndex: 99999 }}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'z-[99999] inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md border border-border/80 bg-popover/95 px-2.5 py-1.5 text-xs text-popover-foreground shadow-md backdrop-blur-xs pointer-events-none select-none duration-150 has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-1 data-[side=inline-end]:slide-in-from-left-1 data-[side=inline-start]:slide-in-from-right-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-[99999] **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          style={{ zIndex: 99999 }}
          {...props}
        >
          {children}
          {arrow && (
            <TooltipPrimitive.Arrow className="z-[99999] size-2 rotate-45 border border-border/80 bg-popover shadow-2xs" />
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
