import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';

// Adapted from the devignerui "context menu" recipe for this project's dark
// theme (R08). Desktop-only: the hook refuses to open on touch-first devices
// (hover: none), so mobile keeps its buttons and gestures. Consumers spread
// openFromEvent on any element's onContextMenu (works for <tr> too) and render
// <ContextMenu> once; the menu positions at the cursor, clamped to the
// viewport, and closes on Esc / click outside / selection.

export interface ContextMenuItem {
    id: string;
    label: string;
    /** Иконка из @devigner-ui/icons (размер задаёт потребитель, обычно size-4). */
    icon?: React.ReactNode;
    tone?: 'danger';
    disabled?: boolean;
}

export interface ContextMenuHandle {
    position: { x: number; y: number } | null;
    /** Обработчик для onContextMenu: preventDefault + открытие у курсора. */
    openFromEvent: (event: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    open: (x: number, y: number) => void;
    close: () => void;
}

const isDesktopPointer = (): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return !window.matchMedia('(hover: none)').matches;
};

export const useContextMenu = (): ContextMenuHandle => {
    const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);

    const open = React.useCallback((x: number, y: number) => {
        if (!isDesktopPointer()) return;
        setPosition({ x, y });
    }, []);

    const openFromEvent = React.useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }) => {
        event.preventDefault();
        open(event.clientX, event.clientY);
    }, [open]);

    const close = React.useCallback(() => setPosition(null), []);

    return { position, openFromEvent, open, close };
};

export interface ContextMenuProps {
    /** Хендл из useContextMenu(). */
    handle: ContextMenuHandle;
    items: readonly ContextMenuItem[];
    onSelect: (id: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ handle, items, onSelect }) => {
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const [clampedPosition, setClampedPosition] = React.useState<{ x: number; y: number } | null>(null);

    // Не вылазим за экран: меню сначала рендерится скрытым в точке курсора,
    // затем измеряется и прижимается к границам вьюпорта.
    React.useLayoutEffect(() => {
        if (!handle.position) {
            setClampedPosition(null);
            return;
        }
        const element = menuRef.current;
        const width = element?.offsetWidth ?? 200;
        const height = element?.offsetHeight ?? items.length * 36;
        setClampedPosition({
            x: Math.max(8, Math.min(handle.position.x, window.innerWidth - width - 8)),
            y: Math.max(8, Math.min(handle.position.y, window.innerHeight - height - 8)),
        });
    }, [handle.position, items.length]);

    const { position, close } = handle;

    React.useEffect(() => {
        if (!position) return undefined;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        const handlePointerDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handlePointerDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handlePointerDown);
        };
    }, [position, close]);

    if (!position) return null;

    return createPortal(
        <motion.div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: clampedPosition ? 1 : 0, scale: clampedPosition ? 1 : 0.96 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            style={{ left: (clampedPosition ?? position).x, top: (clampedPosition ?? position).y, visibility: clampedPosition ? 'visible' : 'hidden' }}
            className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            aria-disabled={item.disabled || undefined}
                            disabled={item.disabled}
                            onClick={() => {
                                if (item.disabled) return;
                                onSelect(item.id);
                                close();
                            }}
                            className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                                item.tone === 'danger'
                                    ? 'text-red-400 hover:bg-red-500/10'
                                    : 'text-text-primary hover:bg-white/5'
                            }`}
                        >
                            {item.icon && <span className="flex shrink-0 items-center">{item.icon}</span>}
                            {item.label}
                        </button>
                ))}
        </motion.div>,
        document.body,
    );
};
