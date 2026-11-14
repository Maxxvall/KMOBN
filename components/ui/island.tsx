import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

// Adapted from the devignerui "dynamic island" recipe for this project's dark
// theme (R10): the visual shell of a floating pill. State, timers and
// positioning stay with the consumer (SyncToast / UpdateBanner) — the island
// only owns the morph look: pill surface, border, shadow, entrance/exit.
// contentIsland changes size via motion layout, like the original recipe.

export interface IslandProps {
    /** false — островок скрыт (разворачивание/сворачивание анимировано). */
    open: boolean;
    children: React.ReactNode;
    className?: string;
}

export const Island: React.FC<IslandProps> = ({ open, children, className }) => (
    <AnimatePresence initial={false}>
        {open && (
            <motion.div
                layout
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={`inline-flex max-w-full min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface/95 px-4 py-2 shadow-xl backdrop-blur md:min-h-9 ${className ?? ''}`}
            >
                {children}
            </motion.div>
        )}
    </AnimatePresence>
);
