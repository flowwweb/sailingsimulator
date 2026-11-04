import { describe, expect, it } from "vitest";
import { HarborRadio } from "./harbor-radio";

describe("simulated harbor radio", () => {
  it("requires the working channel, a listen, a nearby call and a reply", () => {
    const radio = new HarborRadio();
    expect(radio.call(100)).toContain("80");
    radio.selectChannel(80);
    expect(radio.call(100)).toContain("Listen");
    expect(radio.listen()).toContain("clear");
    expect(radio.call(401)).toContain("400 m");
    expect(radio.call(200)).toContain("200 metres");
    expect(radio.call(200)).toContain("Waiting");
    for (let i = 0; i < 19; i++) expect(radio.update(0.1)).toBe(false);
    expect(radio.update(0.1)).toBe(true);
    expect(radio.update(0.1)).toBe(false);
    expect(radio.call(200)).toContain("replied");
  });

  it("clears listening on a channel change and rejects invalid telemetry", () => {
    const radio = new HarborRadio();
    radio.selectChannel(80);
    radio.listen();
    radio.selectChannel(16);
    radio.selectChannel(80);
    expect(radio.call(20)).toContain("Listen");
    radio.listen();
    for (const invalid of [NaN, Infinity, -1]) expect(radio.call(invalid)).toContain("400 m");
    expect(radio.completed).toBe(false);
  });

  it("abandons a pending call on reset but preserves it across a paused interval", () => {
    const radio = new HarborRadio();
    radio.selectChannel(80);
    radio.listen();
    radio.call(200);
    expect(radio.update(0)).toBe(false);
    expect(radio.awaiting).toBe(true);
    radio.reset();
    for (let i = 0; i < 30; i++) expect(radio.update(0.1)).toBe(false);
    expect(radio.completed).toBe(false);
    expect(radio.channel).toBe(16);
    expect(radio.listened).toBe(false);
  });
});
