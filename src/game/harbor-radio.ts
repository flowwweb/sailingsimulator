// Fictional UK-inspired marina scenario; no signal leaves the device.
export class HarborRadio {
  channel = 16;
  listened = false;
  awaiting = false;
  completed = false;
  private replyDelay = 0;

  reset(): void {
    this.channel = 16;
    this.listened = false;
    this.awaiting = false;
    this.completed = false;
    this.replyDelay = 0;
  }

  selectChannel(channel: number): void {
    if ((channel !== 16 && channel !== 80) || channel === this.channel || this.awaiting) return;
    this.channel = channel;
    this.listened = false;
  }

  listen(): string {
    if (this.awaiting) return "Waiting for the marina's reply.";
    this.listened = true;
    return this.channel === 80
      ? "Channel 80 is clear. Juniper Marina is listening."
      : "Channel 16 is for distress, safety and calling. Juniper Marina's simulated working channel is 80.";
  }

  call(distanceM: number): string {
    if (this.completed) return "The marina has replied. Continue navigating safely.";
    if (this.awaiting) return "Waiting for the marina's reply.";
    if (this.channel !== 80) return "Select the marina's working channel, 80.";
    if (!this.listened) return "Listen on the selected channel before calling.";
    if (!Number.isFinite(distanceM) || distanceM > 400 || distanceM < 0) return "Sail within 400 m of Juniper Marina before calling.";
    this.awaiting = true;
    this.replyDelay = 2;
    return `Juniper Marina, this is Fair Winds, approximately ${Math.round(distanceM)} metres from the marina. Request a visitor berth. Over.`;
  }

  update(dt: number): boolean {
    if (!this.awaiting || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return false;
    this.replyDelay -= dt;
    if (this.replyDelay > 0) return false;
    this.awaiting = false;
    this.completed = true;
    return true;
  }
}
