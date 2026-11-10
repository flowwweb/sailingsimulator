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

  it("fails on dummy contact during departure", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(session, 5);
    expect(session.stage).toBe("depart");
    travel(session, 5, 1.4);
    expect(session.stage).toBe("failed");
    travel(session, 1.4, 41);
    expect(session.recover()).toBe(false);
  });

  it("requires departure, trim and steering, a settled approach and explicit recovery", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(session, 5);
    expect(session.recover()).toBe(false);
    travel(session, 5, 41);
    expect(session.stage).toBe("return");
    travel(session, 41, 7, 1);
    hold(session, 7, 1);
    expect(session.recover()).toBe(false);
    hold(session, 7);
    expect(session.stage).toBe("return");
    travel(session, 7, 1.8);
    hold(session, 1.8);
    expect(session.stage).toBe("ready");
    expect(session.view({ x: 1.8, z: 0 }).progress).toBe(1);
    expect(session.view({ x: 1.8, z: 0 }).instruction).toContain("Open status");
    expect(session.recover()).toBe(true);
    expect(session.view({ x: 1.8, z: 0 }).instruction).toBe("Training dummy recovered.");
    expect(session.recover()).toBe(false);
  });

  it("clears held evidence on interruption and latches contact or a jump", () => {
    for (const unsafe of [false, true]) {
      const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
      tick(session, 5);
      tick(session, unsafe ? 0 : 41, 0, unsafe);
      expect(session.stage).toBe("failed");
      session.interrupt();
      expect(session.recover()).toBe(false);
    }
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    travel(session, 5, 41);
    travel(session, 41, 1.8);
    hold(session, 1.8);
    expect(session.stage).toBe("ready");
    session.interrupt();
    expect(session.recover()).toBe(false);
    expect(session.stage).toBe("return");
    tick(session, 1.8);
    hold(session, 1.8);
    expect(session.stage).toBe("return");
    travel(session, 1.8, 39);
    travel(session, 39, 1.8);
    hold(session, 1.8);
    expect(session.stage).toBe("ready");
    session.interrupt();
    tick(session, 0);
    expect(session.stage).toBe("failed");
    const retry = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(retry, 5);
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
    travel(session, 5, 20);
    expect(session.needsDepartureStart({ x: 20, z: 0 })).toBe(false);
    session.interrupt();
    tick(session, 20);
    expect(session.needsDepartureStart({ x: 20, z: 0 })).toBe(true);
    expect(session.view({ x: 20, z: 0 }).instruction).toContain("Return within 8 m");
    travel(session, 20, 7);
    expect(session.needsDepartureStart({ x: 7, z: 0 })).toBe(false);
  });

  it("does not credit motion without trim or helm and fails on dummy contact", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    const tickWithoutControls = (x: number) => session.update(dt, { x, z: 0 }, 0.2, false, 0.5, 0, 0, 0, 0);
    for (let x = 5; x <= 41; x += 0.1) tickWithoutControls(x);
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
      travel(session, 5, 41);
      travel(session, 41, 3);
      for (let i = 0; i < 190; i++) session.update(dt, { x: 3, z: 0 }, 0.2, false, 0.6, 0, heading, 0, 0);
      expect(session.stage).toBe("return");
      expect(session.recover()).toBe(false);
    }
  });

  it("accepts a settled approach on either side and detects overlap beyond a radial-only guard", () => {
    for (const side of [-1, 1]) {
      const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
      travel(session, side * 5, side * 41);
      travel(session, side * 41, side * 1.8);
      hold(session, side * 1.8);
      expect(session.stage).toBe("ready");
    }
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    travel(session, 5, 41);
    session.interrupt();
    session.update(dt, { x: 1.4, z: 2.8 }, 0, false, 0.5, 0, 0, 0, 0);
    expect(session.stage).toBe("failed");
  });

  it("guides the next unmet approach check without making the dummy recoverable", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(session, 5); travel(session, 5, 41);
    expect(session.view({ x: 41, z: 0 }).instruction).toBe("Return alongside the dummy.");
    travel(session, 41, 7);
    expect(session.view({ x: 7, z: 0 }).instruction).toContain("within reach");
    tick(session, 7, 1);
    expect(session.view({ x: 7, z: 0 }).instruction).toContain("Slow below 1 kn");
    expect(session.view({ x: 7, z: 0 }).progress).toBe(0);
    expect(session.recover()).toBe(false);
    travel(session, 7, 5);
    for (let i = 1; i <= 100; i++) {
      session.update(dt, { x: 5 - i * 0.05, z: i * 0.05 }, 0.4, false, 0.6, 0, 0, 0, 0);
    }
    expect(session.stage).toBe("return");
    expect(session.view({ x: 0, z: 5 }).instruction).toContain("abeam");
    expect(session.view({ x: 0, z: 5 }).progress).toBe(0);
  });

  it("shows real hold progress and resets it on speed, yaw or reach loss", () => {
    const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
    tick(session, 5); travel(session, 5, 41); travel(session, 41, 1.8);
    const sample = (speed = 0.4, yaw = 0, x = 1.8) => session.update(dt, { x, z: 0 }, speed, false, 0.6, 0, 0, 0, yaw);
    for (let i = 0; i < 60; i++) sample();
    expect(session.view({ x: 1.8, z: 0 }).instruction).toBe("Hold steady for 3 seconds.");
    expect(session.view({ x: 1.8, z: 0 }).progress).toBeGreaterThan(0.3);
    expect(session.view({ x: 1.8, z: 0 }).progress).toBeLessThan(0.4);
    expect(session.recover()).toBe(false);
    sample(0.50001);
    expect(session.view({ x: 1.8, z: 0 }).progress).toBe(0);
    expect(session.view({ x: 1.8, z: 0 }).instruction).toContain("Slow below 1 kn");
    for (let i = 0; i < 60; i++) sample(0.5);
    expect(session.view({ x: 1.8, z: 0 }).progress).toBeGreaterThan(0.3);
    sample(0.4, 0.12);
    expect(session.view({ x: 1.8, z: 0 }).progress).toBe(0);
    expect(session.view({ x: 1.8, z: 0 }).instruction).toContain("Center the helm");
    for (let i = 0; i < 60; i++) sample();
    sample(0.4, 0, 2);
    expect(session.view({ x: 2, z: 0 }).progress).toBe(0);
    expect(session.view({ x: 2, z: 0 }).instruction).toContain("within reach");
    expect(session.stage).toBe("return");
  });

  it("clears visible hold progress on interruption, invalid telemetry and failure", () => {
    for (const reason of ["interrupt", "invalid", "contact"]) {
      const session = new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
      tick(session, 5); travel(session, 5, 41); travel(session, 41, 1.8);
      for (let i = 0; i < 60; i++) tick(session, 1.8);
      expect(session.view({ x: 1.8, z: 0 }).progress).toBeGreaterThan(0.3);
      if (reason === "interrupt") session.interrupt();
      else if (reason === "invalid") session.update(NaN, { x: 1.8, z: 0 }, 0.4, false, 0.6, 0, 0, 0, 0);
      else travel(session, 1.8, 1.4);
      expect(session.view({ x: 1.8, z: 0 }).progress).toBe(0);
      expect(session.recover()).toBe(false);
      expect(session.view({ x: 1.8, z: 0 }).instruction).toBe(reason === "contact"
        ? "Attempt failed. Open status to retry." : "Trim and steer back alongside.");
    }
  });
});
