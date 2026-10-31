import { describe, expect, it } from 'vitest';
import { createAppStore } from '../../../src/store/index.ts';
import { DOCK_HEIGHT_px } from '../../../src/store/slices/ui.ts';

describe('ui slice: layout (P5.1, §8.1)', () => {
  it('the dock starts at 280 px and resizes within 160–480 px', () => {
    const store = createAppStore();
    expect(store.getState().ui.dockHeight_px).toBe(280);
    expect(DOCK_HEIGHT_px).toEqual({ min: 160, max: 480, initial: 280 });
    store.getState().ui.setDockHeight(400);
    expect(store.getState().ui.dockHeight_px).toBe(400);
    store.getState().ui.setDockHeight(50);
    expect(store.getState().ui.dockHeight_px).toBe(160);
    store.getState().ui.setDockHeight(900);
    expect(store.getState().ui.dockHeight_px).toBe(480);
  });
});
