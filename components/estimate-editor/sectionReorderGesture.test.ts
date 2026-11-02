import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstimateCategory } from '../../types';
import { createSectionReorderGesture } from './sectionReorderGesture';

afterEach(() => vi.useRealTimers());

describe('section long press gesture', () => {
    it('activates at 400ms, commits once on release and suppresses the resulting click', () => {
        vi.useFakeTimers();
        const callbacks = { onActivate: vi.fn(), onMove: vi.fn(), onFinish: vi.fn() };
        const gesture = createSectionReorderGesture(callbacks);
        expect(gesture.start(EstimateCategory.ROOF, 1, 20, 50)).toBe(true);
        vi.advanceTimersByTime(399);
        expect(callbacks.onActivate).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(callbacks.onActivate).toHaveBeenCalledWith(EstimateCategory.ROOF, 20, 50);
        gesture.move(2, 20, 90);
        expect(callbacks.onMove).not.toHaveBeenCalled();
        gesture.move(1, 20, 90);
        expect(callbacks.onMove).toHaveBeenCalledWith(20, 90);
        gesture.finish(1);
        gesture.finish(1);
        expect(callbacks.onFinish).toHaveBeenCalledExactlyOnceWith(true);
        expect(gesture.consumeClick()).toBe(true);
        expect(gesture.consumeClick()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves a short click alone and lets an early swipe cancel the hold', () => {
        vi.useFakeTimers();
        const callbacks = { onActivate: vi.fn(), onMove: vi.fn(), onFinish: vi.fn() };
        const gesture = createSectionReorderGesture(callbacks);
        gesture.start(EstimateCategory.WALLS, 1, 0, 0);
        vi.advanceTimersByTime(399);
        gesture.finish(1);
        expect(gesture.consumeClick()).toBe(false);
        gesture.start(EstimateCategory.ROOF, 2, 0, 0);
        gesture.move(2, 0, 12);
        vi.advanceTimersByTime(1000);
        expect(gesture.isPending()).toBe(false);
        expect(callbacks.onActivate).not.toHaveBeenCalled();
        expect(callbacks.onFinish).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels pending and active gestures without committing, and rejects a second pointer', () => {
        vi.useFakeTimers();
        const callbacks = { onActivate: vi.fn(), onMove: vi.fn(), onFinish: vi.fn() };
        const gesture = createSectionReorderGesture(callbacks);
        gesture.start(EstimateCategory.ROOF, 1, 0, 0);
        expect(gesture.start(EstimateCategory.WALLS, 2, 0, 0)).toBe(false);
        gesture.finish(2);
        expect(gesture.isPending()).toBe(true);
        gesture.cancel();
        vi.advanceTimersByTime(500);
        expect(callbacks.onActivate).not.toHaveBeenCalled();
        gesture.start(EstimateCategory.ROOF, 3, 0, 0);
        vi.advanceTimersByTime(400);
        gesture.cancel();
        gesture.finish(3);
        expect(callbacks.onFinish).toHaveBeenCalledExactlyOnceWith(false);
        expect(gesture.isActive()).toBe(false);
        expect(gesture.isPending()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        expect(gesture.consumeClick()).toBe(true);
        gesture.start(EstimateCategory.WALLS, 4, 0, 0);
        expect(gesture.consumeClick()).toBe(false);
        gesture.cancel();
    });
});
