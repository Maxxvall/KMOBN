import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SectionId } from '../../types';
import { createSectionReorderGesture } from './sectionReorderGesture';

interface DragPreview {
    id: SectionId;
    x: number;
    y: number;
    beforeId: SectionId | null;
}

const isInteractive = (target: EventTarget | null) => target instanceof Element
    && Boolean(target.closest('button, a, input, select, textarea, [role="button"], [contenteditable="true"]'));

export const useSectionReorder = ({ order, resetKey, disabled, onCommit }: {
    order: readonly SectionId[];
    resetKey: unknown;
    disabled: boolean;
    onCommit: (order: SectionId[]) => void;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [preview, setPreview] = useState<{ id: SectionId } | null>(null);
    const previewElementRef = useRef<HTMLDivElement>(null);
    const insertionMarkerRef = useRef<HTMLDivElement>(null);
    const [announcement, setAnnouncement] = useState('');
    const latest = useRef({ order, onCommit });
    // A successful drop changes order and recreates listeners before the browser's click.
    const consumeReleaseClick = useRef<(() => boolean) | null>(null);
    latest.current = { order, onCommit };
    const orderKey = JSON.stringify(order);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || disabled || latest.current.order.length < 2) return;
        let source: HTMLElement | null = null;
        let pointerId: number | null = null;
        let touchId: number | null = null;
        let drag: DragPreview | null = null;
        let frame = 0;
        let lastFrame = 0;
        let scrollElement: Element | null = null;
        let headers: HTMLElement[] = [];
        let positionDirty = false;
        const getHeader = (target: EventTarget | null) => target instanceof Element
            ? target.closest<HTMLElement>('[data-section-header]') : null;
        const dropOrder = () => {
            if (!drag) return [...latest.current.order];
            const rest = latest.current.order.filter(id => id !== drag!.id);
            const index = drag.beforeId === null ? rest.length : rest.indexOf(drag.beforeId);
            rest.splice(index < 0 ? rest.length : index, 0, drag.id);
            return rest;
        };
        // Pointer events only update coordinates. The frame loop moves two small
        // overlay elements without re-rendering the editor and its position rows.
        const renderPosition = () => {
            if (!drag) return;
            const target = headers.find(header => {
                if (header.dataset.sectionHeader === drag!.id) return false;
                const bounds = header.getBoundingClientRect();
                return drag!.y < bounds.top + bounds.height / 2;
            });
            drag.beforeId = target?.dataset.sectionHeader as SectionId | undefined ?? null;
            const card = (target ?? headers.at(-1))?.closest<HTMLElement>('[data-section-card]');
            const markerBounds = card?.getBoundingClientRect();
            const previewElement = previewElementRef.current;
            const marker = insertionMarkerRef.current;
            if (previewElement) {
                const width = Math.min(240, window.innerWidth - 16);
                const x = Math.max(8, Math.min(drag.x + 16, window.innerWidth - width - 8));
                const y = Math.max(8, Math.min(drag.y + 16, window.innerHeight - 60));
                previewElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                previewElement.style.visibility = 'visible';
            }
            if (marker && markerBounds) {
                marker.style.width = `${markerBounds.width}px`;
                marker.style.transform = `translate3d(${markerBounds.left}px, ${target ? markerBounds.top - 6 : markerBounds.bottom + 4}px, 0)`;
                marker.style.visibility = 'visible';
            }
            positionDirty = !previewElement || !marker;
        };
        const updatePosition = (x: number, y: number) => {
            if (!drag) return;
            drag.x = x;
            drag.y = y;
            positionDirty = true;
        };
        const scrollAtEdge = (now: number) => {
            if (!drag) return;
            const elapsed = lastFrame ? Math.min(now - lastFrame, 32) : 16;
            lastFrame = now;
            const isPage = scrollElement === document.scrollingElement;
            const bounds = !isPage && scrollElement ? scrollElement.getBoundingClientRect() : null;
            const top = Math.max(0, bounds?.top ?? 0);
            const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
            const edge = 64;
            const speed = drag.y < top + edge ? -Math.min(1, (top + edge - drag.y) / edge)
                : drag.y > bottom - edge ? Math.min(1, (drag.y - bottom + edge) / edge) : 0;
            if (scrollElement && speed) {
                const previousScrollTop = scrollElement.scrollTop;
                scrollElement.scrollTop += speed * elapsed * 0.7;
                if (scrollElement.scrollTop !== previousScrollTop) positionDirty = true;
            }
            if (positionDirty) renderPosition();
            frame = requestAnimationFrame(scrollAtEdge);
        };
        const invalidatePosition = () => { if (drag) positionDirty = true; };
        const releaseCapture = () => {
            if (pointerId !== null && source?.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
            source = null;
            pointerId = null;
            touchId = null;
        };
        const gesture = createSectionReorderGesture({
            onActivate(id, x, y) {
                consumeReleaseClick.current = gesture.consumeClick;
                if (pointerId !== null && source?.isConnected) source.setPointerCapture(pointerId);
                scrollElement = source?.parentElement ?? null;
                while (scrollElement && !(scrollElement.scrollHeight > scrollElement.clientHeight
                    && /(auto|scroll)/.test(getComputedStyle(scrollElement).overflowY))) {
                    scrollElement = scrollElement.parentElement;
                }
                scrollElement ??= document.scrollingElement;
                const index = latest.current.order.indexOf(id);
                drag = { id, x, y, beforeId: latest.current.order[index + 1] ?? null };
                headers = [...container.querySelectorAll<HTMLElement>('[data-section-header]')];
                positionDirty = true;
                setPreview({ id });
                setAnnouncement('Раздел захвачен. Переместите и отпустите. Escape — отмена.');
                lastFrame = 0;
                frame = requestAnimationFrame(scrollAtEdge);
            },
            onMove: updatePosition,
            onFinish(commit) {
                // A release may arrive before the next animation frame.
                if (commit && positionDirty) renderPosition();
                const nextOrder = dropOrder();
                drag = null;
                cancelAnimationFrame(frame);
                frame = 0;
                setPreview(null);
                releaseCapture();
                if (commit && nextOrder.some((id, index) => id !== latest.current.order[index])) {
                    latest.current.onCommit(nextOrder);
                    setAnnouncement('Порядок разделов изменён.');
                } else setAnnouncement(commit ? 'Раздел остался на месте.' : 'Перенос отменён.');
            },
        });
        const cancel = () => { gesture.cancel(); releaseCapture(); };
        const pointerDown = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0 || gesture.isPending()) return;
            consumeReleaseClick.current = null;
            if (isInteractive(event.target)) return;
            const header = getHeader(event.target);
            if (!header || !container.contains(header)) return;
            source = header;
            pointerId = event.pointerId;
            gesture.start(header.dataset.sectionHeader as SectionId, event.pointerId, event.clientX, event.clientY);
        };
        const pointerMove = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || event.pointerId !== pointerId) return;
            gesture.move(event.pointerId, event.clientX, event.clientY);
            if (gesture.isActive()) event.preventDefault();
            if (!gesture.isPending()) releaseCapture();
        };
        const pointerUp = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || event.pointerId !== pointerId) return;
            gesture.finish(event.pointerId);
            releaseCapture();
        };
        const pointerCancel = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || event.pointerId === pointerId) cancel();
        };
        const touchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) { cancel(); return; }
            if (gesture.isPending()) return;
            consumeReleaseClick.current = null;
            if (isInteractive(event.target)) return;
            const header = getHeader(event.target);
            if (!header || !container.contains(header)) return;
            const touch = event.changedTouches[0];
            source = header;
            touchId = touch.identifier;
            gesture.start(header.dataset.sectionHeader as SectionId, touch.identifier, touch.clientX, touch.clientY);
        };
        const touchMove = (event: TouchEvent) => {
            if (touchId === null) return;
            if (event.touches.length !== 1) { cancel(); return; }
            const touch = [...event.changedTouches].find(value => value.identifier === touchId);
            if (!touch) return;
            // Registered before touchstart, non-passive, scoped to this list. Early swipes stay native.
            // touch-action cannot be changed for a gesture that has already started.
            if (gesture.isActive()) {
                if (!event.cancelable) { cancel(); return; }
                event.preventDefault();
            }
            gesture.move(touch.identifier, touch.clientX, touch.clientY);
            if (!gesture.isPending()) releaseCapture();
        };
        const touchEnd = (event: TouchEvent) => {
            if (touchId === null || ![...event.changedTouches].some(value => value.identifier === touchId)) return;
            gesture.finish(touchId);
            releaseCapture();
        };
        const click = (event: MouseEvent) => {
            if (event.detail > 0 && getHeader(event.target) && consumeReleaseClick.current?.()) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        const keyDown = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
        const contextMenu = (event: Event) => { if (gesture.isPending() && getHeader(event.target)) event.preventDefault(); };
        const nativeDrag = (event: Event) => { if (gesture.isPending()) event.preventDefault(); };
        container.addEventListener('pointerdown', pointerDown);
        container.addEventListener('touchstart', touchStart, { passive: true });
        container.addEventListener('touchmove', touchMove, { passive: false });
        container.addEventListener('click', click, true);
        container.addEventListener('contextmenu', contextMenu);
        container.addEventListener('dragstart', nativeDrag);
        window.addEventListener('pointermove', pointerMove, { passive: false });
        window.addEventListener('pointerup', pointerUp);
        window.addEventListener('pointercancel', pointerCancel);
        window.addEventListener('lostpointercapture', pointerCancel);
        window.addEventListener('touchend', touchEnd);
        window.addEventListener('touchcancel', cancel);
        window.addEventListener('blur', cancel);
        window.addEventListener('keydown', keyDown);
        window.addEventListener('scroll', invalidatePosition, true);
        window.addEventListener('resize', invalidatePosition);
        return () => {
            cancel();
            cancelAnimationFrame(frame);
            container.removeEventListener('pointerdown', pointerDown);
            container.removeEventListener('touchstart', touchStart);
            container.removeEventListener('touchmove', touchMove);
            container.removeEventListener('click', click, true);
            container.removeEventListener('contextmenu', contextMenu);
            container.removeEventListener('dragstart', nativeDrag);
            window.removeEventListener('pointermove', pointerMove);
            window.removeEventListener('pointerup', pointerUp);
            window.removeEventListener('pointercancel', pointerCancel);
            window.removeEventListener('lostpointercapture', pointerCancel);
            window.removeEventListener('touchend', touchEnd);
            window.removeEventListener('touchcancel', cancel);
            window.removeEventListener('blur', cancel);
            window.removeEventListener('keydown', keyDown);
            window.removeEventListener('scroll', invalidatePosition, true);
            window.removeEventListener('resize', invalidatePosition);
        };
    }, [disabled, orderKey, resetKey]);

    const onHeaderKeyDown = (event: KeyboardEvent, id: SectionId) => {
        if (disabled || !event.altKey || latest.current.order.length < 2) return;
        const current = [...latest.current.order];
        const index = current.indexOf(id);
        const target = event.key === 'ArrowUp' ? Math.max(0, index - 1)
            : event.key === 'ArrowDown' ? Math.min(current.length - 1, index + 1)
                : event.key === 'Home' ? 0 : event.key === 'End' ? current.length - 1 : -1;
        if (target < 0 || index < 0) return;
        event.preventDefault();
        if (target === index) return;
        current.splice(index, 1);
        current.splice(target, 0, id);
        latest.current.onCommit(current);
        setAnnouncement(`Раздел перемещён на позицию ${target + 1}.`);
    };
    return { containerRef, previewElementRef, insertionMarkerRef, preview, announcement, onHeaderKeyDown };
};
