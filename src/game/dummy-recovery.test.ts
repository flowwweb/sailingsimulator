import { describe, expect, it } from "vitest";
import { DummyRecovery } from "./dummy-recovery";

describe("dummy recovery", () => {
  const dt = 1 / 60;
  function tick(session: DummyRecovery, x: number, speed = 0.4, unsafe = false) {
    session.update(dt, { x, z: 0 }, speed, unsafe, 0.5 + x * 0.002, 1, x * 0.002, 0.2, 0);
  }
  function travel(session: DummyRecovery, from: number, to: number, speed = 0.4) {
    const direction = Math.sign(to - from);
    for (let x = from; direction * (to - x) > 0; x += direction * 0.1) tick(session, x, speed);
    tick(session, to, speed);
  }
  function hold(session: DummyRecovery, x: number, speed = 0.4) {
    for (let i = 0; i < 190; i++) tick(session, x, speed);
  }

  it("requires departure, trim and steering, a settled approach and explicit recovery", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(session, 0);
    expect(session.recover()).toBe(false);
    travel(session, 0, 41);
    expect(session.stage).toBe("return");
    travel(session, 41, 7, 1);
    hold(session, 7, 1);
    expect(session.recover()).toBe(false);
    hold(session, 7);
    expect(session.stage).toBe("ready");
    expect(session.recover()).toBe(true);
    expect(session.recover()).toBe(false);
  });

  it("clears held evidence on interruption and latches contact or a jump", () => {
    for (const unsafe of [false, true]) {
      const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
      tick(session, 0);
      tick(session, unsafe ? 0 : 41, 0, unsafe);
      expect(session.stage).toBe("failed");
      session.interrupt();
      expect(session.recover()).toBe(false);
    }
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    travel(session, 0, 41);
    travel(session, 41, 7);
    hold(session, 7);
    expect(session.stage).toBe("ready");
    session.interrupt();
    expect(session.recover()).toBe(false);
    expect(session.stage).toBe("return");
    tick(session, 7);
    hold(session, 7);
    expect(session.stage).toBe("return");
    travel(session, 7, 39);
    travel(session, 39, 7);
    hold(session, 7);
    expect(session.stage).toBe("ready");
    session.interrupt();
    tick(session, 0);
    expect(session.stage).toBe("failed");
    const retry = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(retry, 0);
    expect(retry.stage).toBe("depart");
  });

  it("does not credit an attempt that starts away from the dummy", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(session, 50);
    tick(session, 50);
    expect(session.stage).toBe("depart");
    expect(session.needsDepartureStart({ x: 50, z: 0 })).toBe(true);
    expect(session.recover()).toBe(false);
  });

  it("explains how to restart departure after an interruption", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    travel(session, 0, 20);
    expect(session.needsDepartureStart({ x: 20, z: 0 })).toBe(false);
    session.interrupt();
    tick(session, 20);
    expect(session.needsDepartureStart({ x: 20, z: 0 })).toBe(true);
    travel(session, 20, 7);
    expect(session.needsDepartureStart({ x: 7, z: 0 })).toBe(false);
  });

  it("does not credit motion without trim or helm and fails on dummy contact", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    const tickWithoutControls = (x: number) => session.update(dt, { x, z: 0 }, 0.2, false, 0.5, 0, 0, 0, 0);
    for (let x = 0; x <= 41; x += 0.1) tickWithoutControls(x);
    for (let x = 41; x >= 7; x -= 0.1) tickWithoutControls(x);
    for (let i = 0; i < 190; i++) tickWithoutControls(7);
    expect(session.stage).toBe("return");
    expect(session.recover()).toBe(false);
    for (let x = 7; x >= 1.3; x -= 0.1) tickWithoutControls(x);
    expect(session.stage).toBe("failed");
  });

  it("does not allow a bow-on or stern-on position as alongside", () => {
    for (const heading of [Math.PI / 2, -Math.PI / 2]) {
      const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
      travel(session, 0, 41);
      travel(session, 41, 7);
      for (let i = 0; i < 190; i++) session.update(dt, { x: 7, z: 0 }, 0.2, false, 0.6, 0, heading, 0, 0);
      expect(session.stage).toBe("return");
      expect(session.recover()).toBe(false);
    }
  });

  it("accepts a settled approach on either side and detects overlap beyond a radial-only guard", () => {
    for (const side of [-1, 1]) {
      const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
      travel(session, 0, side * 41);
      travel(session, side * 41, side * 7);
      hold(session, side * 7);
      expect(session.stage).toBe("ready");
    }
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    travel(session, 0, 41);
    session.interrupt();
    session.update(dt, { x: 1.4, z: 2.8 }, 0, false, 0.5, 0, 0, 0, 0);
    expect(session.stage).toBe("failed");
  });
});
