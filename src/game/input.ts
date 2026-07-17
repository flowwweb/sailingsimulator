import type { Controls } from "../sim/model";

type ControlName = "port" | "starboard" | "ease" | "sheet";

export class GameInput {
  private readonly active = new Set<ControlName>();
  private readonly keys = new Set<string>();
  private resetRequested = false;
  private muteRequested = false;
  private conditionsRequested = false;

  constructor(root: ParentNode = document) {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });
    root.querySelectorAll<HTMLElement>("[data-control]").forEach((element) => {
      const control = element.dataset.control as ControlName | undefined;
      if (!control) return;
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.active.delete(control);
      };
      element.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        this.active.add(control);
      });
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("lostpointercapture", release);
      element.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }

  read(): Controls {
    const port = this.active.has("port") || this.keys.has("KeyA") || this.keys.has("ArrowLeft");
    const starboard = this.active.has("starboard") || this.keys.has("KeyD") || this.keys.has("ArrowRight");
    const ease = this.active.has("ease") || this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const sheet = this.active.has("sheet") || this.keys.has("KeyS") || this.keys.has("ArrowDown");
    return {
      rudder: Number(starboard) - Number(port),
      sheetRate: Number(ease) - Number(sheet),
    };
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

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
  }

  private consume(key: "resetRequested" | "muteRequested" | "conditionsRequested"): boolean {
    const value = this[key];
    this[key] = false;
    return value;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat && event.code === "KeyR") this.resetRequested = true;
    if (!event.repeat && event.code === "KeyM") this.muteRequested = true;
    if (!event.repeat && event.code === "KeyC") this.conditionsRequested = true;
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly clear = (): void => {
    this.active.clear();
    this.keys.clear();
  };
}
