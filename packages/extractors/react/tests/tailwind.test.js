import { describe, it, expect } from 'vitest';
import { resolveTailwindClasses } from '../src/tailwind.js';
import { isKnown } from '@fe-design/kernel/ir/fact.js';
describe('resolveTailwindClasses', () => {
    it('resolves uniform padding', () => {
        const s = resolveTailwindClasses('p-4');
        expect(isKnown(s.space.padding)).toBe(true);
        if (isKnown(s.space.padding)) {
            expect(s.space.padding.value).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
        }
    });
    it('resolves axis padding, with later classes overriding earlier ones', () => {
        const s = resolveTailwindClasses('p-4 px-2');
        if (isKnown(s.space.padding)) {
            expect(s.space.padding.value).toEqual({ top: 16, right: 8, bottom: 16, left: 8 });
        }
    });
    it('resolves an arbitrary px value', () => {
        const s = resolveTailwindClasses('p-[13px]');
        if (isKnown(s.space.padding))
            expect(s.space.padding.value.top).toBe(13);
    });
    it('converts rem arbitrary values to px', () => {
        const s = resolveTailwindClasses('p-[1.5rem]');
        if (isKnown(s.space.padding))
            expect(s.space.padding.value.top).toBe(24);
    });
    it('resolves text size and font weight', () => {
        const s = resolveTailwindClasses('text-lg font-semibold');
        if (isKnown(s.type.size))
            expect(s.type.size.value.px).toBe(18);
        if (isKnown(s.type.weight))
            expect(s.type.weight.value).toBe(600);
    });
    it('resolves text and background colors', () => {
        const s = resolveTailwindClasses('text-gray-400 bg-white');
        if (isKnown(s.color.fg))
            expect(s.color.fg.value.hex).toBe('#9ca3af');
        if (isKnown(s.color.bg))
            expect(s.color.bg.value.hex).toBe('#ffffff');
    });
    it('resolves an arbitrary text size and an arbitrary text color', () => {
        const size = resolveTailwindClasses('text-[13px]');
        if (isKnown(size.type.size))
            expect(size.type.size.value.px).toBe(13);
        const color = resolveTailwindClasses('text-[#22543D]');
        if (isKnown(color.color.fg))
            expect(color.color.fg.value.hex).toBe('#22543D');
    });
    it('resolves border radius and border width', () => {
        const s = resolveTailwindClasses('rounded-xl border');
        if (isKnown(s.shape.radius))
            expect(s.shape.radius.value.px).toBe(12);
        if (isKnown(s.shape.borderWidth))
            expect(s.shape.borderWidth.value.px).toBe(1);
    });
    it('leaves unrecognised classes absent, not unknown', () => {
        expect(resolveTailwindClasses('grid-flow-dense').space.padding.state).toBe('absent');
    });
    it('records the raw class list', () => {
        expect(resolveTailwindClasses('p-4 text-lg').raw).toEqual(['p-4', 'text-lg']);
    });
});
