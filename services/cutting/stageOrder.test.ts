import { describe, expect, it } from 'vitest';
import { classifyCuttingStage } from './stageOrder';

describe('classifyCuttingStage', () => {
    it.each([
        ['Бриджи кровли', 'roof'],
        ['Бриджи для стен', 'walls'],
        ['Бриджи', 'joists'],
    ] as const)('uses the construction context for "%s"', (construction, expectedStage) => {
        expect(classifyCuttingStage(construction)).toBe(expectedStage);
    });
});
