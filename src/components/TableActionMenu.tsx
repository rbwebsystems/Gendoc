import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type TableActionMenuProps = {
  children: ReactNode;
  label?: string;
};

export function TableActionMenu({ children, label = "Əməliyyatlar" }: TableActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 190;
      const menuHeight = menuRef.current?.offsetHeight ?? 180;
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
      const below = rect.bottom + 5;
      const top = below + menuHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - menuHeight - 5);
      setPosition({ top, left });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return (
    <div className="dg-action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="dg-action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden>⋮</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="dg-action-menu-popover"
              role="menu"
              aria-label={label}
              style={{ top: position.top, left: position.left }}
              onClick={(event) => {
                if ((event.target as Element).closest("button:not(:disabled)")) setOpen(false);
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
