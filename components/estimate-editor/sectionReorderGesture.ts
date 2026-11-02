import type { SectionId } from '../../types';

export interface SectionReorderCallbacks {
    onActivate: (id: SectionId, x: number, y: number) => void;
    onMove: (x: number, y: number) => void;
    onFinish: (commit: boolean) => void;
}

export const createSectionReorderGesture = (callbacks: SectionReorderCallbacks) => {
    let press: { id: SectionId; pointerId: number; x: number; y: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = false;
    let suppressClick = false;
    const clear = (commit: boolean) => {
        clearTimeout(timer);
        timer = undefined;
        const wasActive = active;
        press = null;
        active = false;
        if (wasActive) callbacks.onFinish(commit);
    };
    return {
        start(id: SectionId, pointerId: number, x: number, y: number) {
            if (press) return false;
            suppressClick = false;
            press = { id, pointerId, x, y };
            timer = setTimeout(() => {
                timer = undefined;
                if (!press) return;
                active = true;
                suppressClick = true;
                callbacks.onActivate(press.id, press.x, press.y);
            }, 400);
            return true;
        },
        move(pointerId: number, x: number, y: number) {
            if (!press || press.pointerId !== pointerId) return;
            if (active) callbacks.onMove(x, y);
            else if (Math.hypot(x - press.x, y - press.y) > 8) clear(false);
        },
        finish(pointerId: number) {
            if (press?.pointerId === pointerId) clear(true);
        },
        cancel: () => clear(false),
        isActive: () => active,
        isPending: () => Boolean(press),
        consumeClick() {
            const result = suppressClick;
            suppressClick = false;
            return result;
        },
    };
};
