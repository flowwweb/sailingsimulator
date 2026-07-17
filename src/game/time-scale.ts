export const NORMAL_TIME_SCALE = 1;
export const FAST_FORWARD_TIME_SCALE = 2;

export function timeScaleForHold(fastForwarding: boolean): number {
  return fastForwarding ? FAST_FORWARD_TIME_SCALE : NORMAL_TIME_SCALE;
}
