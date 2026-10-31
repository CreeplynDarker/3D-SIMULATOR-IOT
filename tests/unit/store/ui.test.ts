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

describe('ui slice: fault controls (P5.4)', () => {
  it('holds a target per fault, the ramp switch and the ramp time; reset zeroes the targets', () => {
    const store = createAppStore();
    const ui = () => store.getState().ui;
    expect(ui().faultTargets).toEqual({ imbalance_g: 0, looseness: 0, friction: 0, overheat: 0, supplySag_V: 0, packetLoss: 0, ds18b20Disconnect: false }); // prettier-ignore
    expect(ui().ramp).toEqual({ on: false, ramp_s: 30 });
    ui().setFaultTarget('friction', 0.5);
    ui().setFaultTarget('ds18b20Disconnect', true);
    ui().setRamp({ on: true, ramp_s: 12 });
    expect(ui().faultTargets).toMatchObject({ friction: 0.5, ds18b20Disconnect: true });
    expect(ui().ramp).toEqual({ on: true, ramp_s: 12 });
    ui().setRamp({ on: true, ramp_s: -3 });
    expect(ui().ramp.ramp_s).toBe(0);
    ui().resetFaultTargets();
    expect(ui().faultTargets).toMatchObject({ friction: 0, ds18b20Disconnect: false });
  });
});

describe('ui slice: charts (P5.6)', () => {
  it('chart window starts at 120 s and only takes the §5.1 choices; freeze toggles', () => {
    const store = createAppStore();
    const ui = () => store.getState().ui;
    expect(ui().chartWindow_s).toBe(120);
    ui().setChartWindow(30);
    expect(ui().chartWindow_s).toBe(30);
    ui().setChartWindow(45);
    expect(ui().chartWindow_s).toBe(30);
    ui().setChartFrozen(true);
    expect(ui().chartFrozen).toBe(true);
  });
});

describe('console slice: filters (P5.7)', () => {
  it('starts with every kind shown and toggles each', () => {
    const store = createAppStore();
    expect(store.getState().console.filters).toEqual({ packet: true, verdict: true, command: true, log: true });
    store.getState().console.setFilter('verdict', false);
    expect(store.getState().console.filters.verdict).toBe(false);
  });
});
