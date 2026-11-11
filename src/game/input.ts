import type { Controls } from "../sim/model";

type ControlName = "port" | "starboard" | "ease" | "sheet" | "anchor-haul";

export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement || target.isContentEditable
  );
}

export class GameInput {
  private readonly active = new Set<ControlName>();
  private readonly keys = new Set<string>();
  private readonly buttonKeys = new Map<string, ControlName>();
  private readonly clickControls = new Map<ControlName, { until: number; pending: boolean }>();
  private resetRequested = false;
  private muteRequested = false;
  private conditionsRequested = false;
  private reefRequested = false;
  private sailsRequested = false;
  private sheetTarget: number | undefined;
  private steering: { pointerId: number; startX: number; travel: number } | undefined;
  private dragRudder = 0;
  private nextAnchorHaul: number | undefined;
  private readonly canvas: HTMLCanvasElement | null;

  constructor(
    root: ParentNode = document,
    private readonly canControl: () => boolean = () => true,
    private readonly haulAnchor?: () => void,
  ) {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("focusin", this.onFocusIn);
    this.canvas = root.querySelector<HTMLCanvasElement>("#lake");
    this.canvas?.addEventListener("pointerdown", this.startSteering);
    this.canvas?.addEventListener("pointermove", this.moveSteering);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) this.canvas?.addEventListener(type, this.stopSteering);
    window.addEventListener("pointerdown", this.rejectSecondPointer);
    root.querySelector<HTMLInputElement>("#hud-sheet")?.addEventListener("input", event => {
      if (!this.canControl() || document.hidden) return;
      const value = Number((event.currentTarget as HTMLInputElement).value);
      if (Number.isFinite(value)) this.sheetTarget = Math.max(0, Math.min(1, value));
    });
    root.querySelectorAll<HTMLElement>("[data-control]").forEach((element) => {
      const control = element.dataset.control as ControlName | undefined;
      if (!control) return;
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.active.delete(control);
        this.clickControls.delete(control);
        if (control === "anchor-haul") this.nextAnchorHaul = undefined;
      };
      element.addEventListener("pointerdown", (event) => {
        if (!this.canControl() || document.hidden) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        this.clickControls.delete(control);
        this.active.add(control);
        if (control === "anchor-haul") this.startAnchorHaul();
      });
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("lostpointercapture", release);
      element.addEventListener("blur", () => {
        this.active.delete(control);
        for (const [key, held] of this.buttonKeys) if (held === control) this.buttonKeys.delete(key);
        this.clickControls.delete(control);
        if (control === "anchor-haul") this.nextAnchorHaul = undefined;
      });
      element.addEventListener("click", (event) => {
        if (!this.canControl() || document.hidden) return;
        // Native/AT activation has no hold/release pair; use a bounded press.
        if (event.detail === 0 && !this.active.has(control) && ![...this.buttonKeys.values()].includes(control)) {
          if (control === "anchor-haul") this.haulAnchor?.();
          else this.clickControls.set(control, { until: performance.now() + 250, pending: true });
        }
      });
      element.addEventListener("contextmenu", (event) => event.preventDefault());
    });
    root.querySelectorAll<HTMLElement>("[data-sail-action]").forEach((element) => {
      element.addEventListener("click", () => {
        if (!this.canControl() || document.hidden) return;
        if (element.dataset.sailAction === "reef") this.reefRequested = true;
        if (element.dataset.sailAction === "toggle") this.sailsRequested = true;
      });
    });
  }

  read(currentSheet = 0): Controls {
    if (!this.canControl() || document.hidden) { this.releaseAll(); return { rudder: 0, sheetRate: 0 }; }
    const now = performance.now();
    for (const [control, pulse] of this.clickControls) {
      if (!pulse.pending && pulse.until <= now) this.clickControls.delete(control);
      else pulse.pending = false;
    }
    const active = new Set([...this.active, ...this.buttonKeys.values(), ...this.clickControls.keys()]);
    const port = active.has("port") || this.keys.has("KeyA") || this.keys.has("ArrowLeft");
    const starboard = active.has("starboard") || this.keys.has("KeyD") || this.keys.has("ArrowRight");
    const ease = active.has("ease") || this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const sheet = active.has("sheet") || this.keys.has("KeyS") || this.keys.has("ArrowDown");
    const rudder = port || starboard ? Number(starboard) - Number(port) : this.dragRudder;
    const sheetRate = Number(ease) - Number(sheet);
    const target = this.sheetTarget;
    this.sheetTarget = undefined;
    return target === undefined ? { rudder, sheetRate } : {
      rudder, sheetRate: Math.sign(target - currentSheet), sheetTarget: target, headsailRate: sheetRate,
    };
  }

  isFastForwarding(): boolean {
    return this.keys.has("Space");
  }

  releaseAll(): void {
    this.clear();
    this.resetRequested = false;
    this.muteRequested = false;
    this.conditionsRequested = false;
    this.reefRequested = false;
    this.sailsRequested = false;
  }

  consumeReset(): boolean {
    return this.consume("resetRequested");
  }

  consumeMute(): boolean {
    return this.consume("muteRequested");
  }

  consumeConditions(): boolean {
    return this.consume("conditionsRequested");
  }

  consumeReef(): boolean {
    return this.consume("reefRequested");
  }

  consumeSails(): boolean {
    return this.consume("sailsRequested");
  }

  repeatAnchorHaul(): void {
    if (!this.canControl() || document.hidden) { this.clear(); return; }
    const held = this.active.has("anchor-haul") || [...this.buttonKeys.values()].includes("anchor-haul");
    if (!held || this.nextAnchorHaul === undefined || performance.now() < this.nextAnchorHaul) return;
    // Match the existing exercise cadence without catching up missed frames in a burst.
    this.startAnchorHaul();
  }

  private startAnchorHaul(): void {
    this.nextAnchorHaul = performance.now() + 2_000;
    this.haulAnchor?.();
  }

  destroy(): void {
    this.clear();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("focusin", this.onFocusIn);
    window.removeEventListener("pointerdown", this.rejectSecondPointer);
    this.canvas?.removeEventListener("pointerdown", this.startSteering);
    this.canvas?.removeEventListener("pointermove", this.moveSteering);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) this.canvas?.removeEventListener(type, this.stopSteering);
  }

  private readonly onVisibilityChange = (): void => { if (document.hidden) this.clear(); };
  private readonly onFocusIn = (event: FocusEvent): void => {
    if (isTextEntryTarget(event.target)) this.releaseAll();
  };

  private readonly startSteering = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !event.isPrimary || !this.canControl() || document.hidden) return;
    event.preventDefault();
    this.steering = { pointerId: event.pointerId, startX: event.clientX, travel: Math.max(80, Math.min(160, this.canvas!.clientWidth * 0.18)) };
    this.dragRudder = 0;
    this.canvas!.setPointerCapture(event.pointerId);
  };

  private readonly rejectSecondPointer = (event: PointerEvent): void => {
    if (event.pointerType === "touch" && this.steering && event.pointerId !== this.steering.pointerId) this.clearSteering();
  };

  private readonly moveSteering = (event: PointerEvent): void => {
    if (!this.steering || event.pointerId !== this.steering.pointerId) return;
    if (!this.canControl() || document.hidden) { this.clearSteering(); return; }
    event.preventDefault();
    const distance = event.clientX - this.steering.startX;
    this.dragRudder = Math.sign(distance) * Math.min(1, Math.max(0, Math.abs(distance) - 8) / this.steering.travel);
  };

  private readonly stopSteering = (event: PointerEvent): void => {
    if (event.pointerId === this.steering?.pointerId) this.clearSteering();
  };

  private clearSteering(): void {
    const pointerId = this.steering?.pointerId;
    this.steering = undefined;
    this.dragRudder = 0;
    if (pointerId !== undefined && this.canvas?.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }

  private consume(
    key:
      | "resetRequested"
      | "muteRequested"
      | "conditionsRequested"
      | "reefRequested"
      | "sailsRequested",
  ): boolean {
    const value = this[key];
    this[key] = false;
    return value;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTextEntryTarget(event.target)) { this.releaseAll(); return; }
    if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"], summary')) return;
    if (!this.canControl() && !["KeyM", "KeyC"].includes(event.code)) return;
    const control = event.target instanceof HTMLButtonElement ? event.target.dataset.control as ControlName | undefined : undefined;
    if (control && ["Space", "Enter", "NumpadEnter"].includes(event.code)) {
      if (document.hidden) return;
      event.preventDefault();
      if (!event.repeat) {
        this.buttonKeys.set(event.code, control);
        if (control === "anchor-haul") this.startAnchorHaul();
      }
      return;
    }
    if (event.target instanceof HTMLButtonElement && ["Space", "Enter", "NumpadEnter"].includes(event.code)) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat && event.code === "KeyR") this.resetRequested = true;
    if (!event.repeat && event.code === "KeyM") this.muteRequested = true;
    if (!event.repeat && event.code === "KeyC") this.conditionsRequested = true;
    if (!event.repeat && event.code === "KeyQ") this.reefRequested = true;
    if (!event.repeat && event.code === "KeyX") this.sailsRequested = true;
    if (!event.repeat) this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const control = event.target instanceof HTMLButtonElement && event.target.dataset.control;
    if (this.buttonKeys.has(event.code) || (control && ["Space", "Enter", "NumpadEnter"].includes(event.code))) event.preventDefault();
    if (this.buttonKeys.get(event.code) === "anchor-haul") this.nextAnchorHaul = undefined;
    this.buttonKeys.delete(event.code);
    this.keys.delete(event.code);
  };

  private readonly clear = (): void => {
    this.clearSteering();
    this.sheetTarget = undefined;
    this.active.clear();
    this.keys.clear();
    this.buttonKeys.clear();
    this.clickControls.clear();
    this.nextAnchorHaul = undefined;
  };
}
