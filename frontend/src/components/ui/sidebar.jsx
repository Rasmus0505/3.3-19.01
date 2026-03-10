import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import { createContext, forwardRef, useContext, useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

const SidebarContext = createContext(null);

export function SidebarProvider({ children, defaultOpen = true, storageKey = "app-shell-sidebar-open" }) {
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue !== null) {
        setOpen(storedValue === "true");
      }
    } catch (error) {
      console.debug("[DEBUG] sidebar hydrate failed", { storageKey, error });
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, open ? "true" : "false");
      console.debug("[DEBUG] sidebar state persisted", { storageKey, open });
    } catch (error) {
      console.debug("[DEBUG] sidebar persist failed", { storageKey, error });
    }
  }, [hydrated, open, storageKey]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggleSidebar() {
        setOpen((prev) => !prev);
      },
    }),
    [open],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

export const Sidebar = forwardRef(function Sidebar({ className, children, ...props }, ref) {
  const { open } = useSidebar();

  return (
    <aside
      ref={ref}
      data-slot="sidebar"
      data-state={open ? "open" : "collapsed"}
      className={cn(
        "group/sidebar hidden border-r bg-background/95 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:backdrop-blur md:transition-[width] md:duration-200",
        open ? "md:w-72" : "md:w-[88px]",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
});

export const SidebarInset = forwardRef(function SidebarInset({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-inset" className={cn("min-w-0 flex-1", className)} {...props} />;
});

export const SidebarHeader = forwardRef(function SidebarHeader({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-header" className={cn("flex items-center gap-3 border-b p-4", className)} {...props} />;
});

export const SidebarContent = forwardRef(function SidebarContent({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-content" className={cn("flex-1 overflow-y-auto p-3", className)} {...props} />;
});

export const SidebarFooter = forwardRef(function SidebarFooter({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-footer" className={cn("border-t p-3", className)} {...props} />;
});

export const SidebarGroup = forwardRef(function SidebarGroup({ className, ...props }, ref) {
  return <section ref={ref} data-slot="sidebar-group" className={cn("space-y-2", className)} {...props} />;
});

export const SidebarGroupLabel = forwardRef(function SidebarGroupLabel({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-group-label"
      className={cn("px-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground", className)}
      {...props}
    />
  );
});

export const SidebarGroupContent = forwardRef(function SidebarGroupContent({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-group-content" className={cn("space-y-1", className)} {...props} />;
});

export const SidebarMenu = forwardRef(function SidebarMenu({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-menu" className={cn("space-y-1", className)} {...props} />;
});

export const SidebarMenuItem = forwardRef(function SidebarMenuItem({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-menu-item" className={cn("w-full", className)} {...props} />;
});

const sidebarMenuButtonVariants = cva(
  "group/sidebar-menu-button flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition-all outline-none hover:border-primary/30 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60",
  {
    variants: {
      active: {
        true: "border-primary/40 bg-primary/10 text-foreground shadow-sm",
        false: "border-transparent bg-transparent text-muted-foreground",
      },
      collapsed: {
        true: "justify-center px-2",
        false: "",
      },
    },
    defaultVariants: {
      active: false,
      collapsed: false,
    },
  },
);

export const SidebarMenuButton = forwardRef(function SidebarMenuButton(
  { asChild = false, active = false, collapsed = false, className, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      data-slot="sidebar-menu-button"
      data-active={active ? "true" : "false"}
      className={cn(sidebarMenuButtonVariants({ active, collapsed }), className)}
      {...props}
    />
  );
});

export const SidebarSeparator = forwardRef(function SidebarSeparator({ className, ...props }, ref) {
  return <div ref={ref} data-slot="sidebar-separator" className={cn("my-3 h-px bg-border", className)} {...props} />;
});

export const SidebarTrigger = forwardRef(function SidebarTrigger({ className, ...props }, ref) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon-sm"
      className={cn("hidden md:inline-flex", className)}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">切换侧边栏</span>
    </Button>
  );
});
