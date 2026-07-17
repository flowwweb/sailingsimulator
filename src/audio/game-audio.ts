import type { BoatState, SailDiagnostics } from "../sim/model";
import { createRandom, type RandomSource } from "../weather/prng";
import type { WeatherSnapshot } from "../weather/types";
import { computeAudioMixTargets, type AudioMixTargets } from "./mix";
import {
  MUSIC_TRACKS,
  findMusicTrack,
  type MusicTrack,
} from "./music";
import {
  cloneAudioSettings,
  loadAudioSettings,
  saveAudioSettings,
  type AudioChannel,
  type AudioSettings,
} from "./settings";
import type { SoundscapeSnapshot } from "./zones";

const MASTER_OUTPUT_SCALE = 0.62;

interface NoiseBusOptions {
  filterType: BiquadFilterType;
  frequency: number;
  q: number;
  destination: AudioNode;
  stereo?: boolean;
}

export interface MusicPlaybackState {
  track: MusicTrack;
  isPlaying: boolean;
  isReady: boolean;
  isEnabled: boolean;
}

type MusicStateListener = (state: MusicPlaybackState) => void;

export function audioEventsNeedRebase(
  eventsSuppressed: boolean,
  lastUpdateAt: number,
  now: number,
): boolean {
  return (
    eventsSuppressed ||
    (lastUpdateAt > 0 && now - lastUpdateAt > 1)
  );
}

export function audioSeedChanged(
  currentSeed: number,
  nextSeed: number,
): boolean {
  return currentSeed !== nextSeed;
}

export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambienceBus?: GainNode;
  private boatBus?: GainNode;
  private weatherBus?: GainNode;
  private musicBus?: GainNode;
  private musicDucker?: GainNode;
  private musicElement?: HTMLAudioElement;
  private wind?: GainNode;
  private openWater?: GainNode;
  private shore?: GainNode;
  private hull?: GainNode;
  private luff?: GainNode;
  private stall?: GainNode;
  private rain?: GainNode;
  private ambientNoise?: AudioBuffer;
  private boatNoise?: AudioBuffer;
  private oneShotNoise?: AudioBuffer;
  private songbirdSample?: AudioBuffer;
  private waterbirdSample?: AudioBuffer;
  private settings: AudioSettings;
  private musicStateListener?: MusicStateListener;
  private seed: number;
  private random: RandomSource;
  private nextBirdAt = 0;
  private nextCreakAt = 0;
  private nextLapAt = 0;
  private nextDockAt = 0;
  private lastRopeAt = -Infinity;
  private lastFillAt = -Infinity;
  private previousBoomAngle?: number;
  private previousSheet?: number;
  private previousLuff = 0;
  private eventsSuppressed = false;
  private lastUpdateAt = 0;

  constructor(seed = 8_143) {
    this.seed = seed;
    this.random = createRandom(seed ^ 0x41534d52);
    this.settings = loadAudioSettings();
  }

  get isStarted(): boolean {
    return Boolean(this.context);
  }

  get isMuted(): boolean {
    return this.settings.muted;
  }

  getSettings(): AudioSettings {
    return cloneAudioSettings(this.settings);
  }

  getMusicState(): MusicPlaybackState {
    return {
      track:
        findMusicTrack(this.settings.trackId) ??
        MUSIC_TRACKS[0]!,
      isPlaying: Boolean(this.musicElement && !this.musicElement.paused),
      isReady: Boolean(this.context && this.musicElement),
      isEnabled: this.settings.musicEnabled,
    };
  }

  setMusicStateListener(listener: MusicStateListener): void {
    this.musicStateListener = listener;
    this.notifyMusicState();
  }

  async start(): Promise<void> {
    if (this.context) {
      await this.context.resume();
      if (this.settings.musicEnabled && this.musicElement?.paused) {
        await this.playMusic();
      }
      return;
    }
    const context = new AudioContext();
    const master = context.createGain();
    const ambienceBus = context.createGain();
    const boatBus = context.createGain();
    const weatherBus = context.createGain();
    const musicBus = context.createGain();
    const limiter = context.createDynamicsCompressor();
    master.gain.value = this.masterGain();
    limiter.threshold.value = -20;
    limiter.knee.value = 16;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.015;
    limiter.release.value = 0.35;
    master.connect(limiter).connect(context.destination);
    ambienceBus.connect(master);
    boatBus.connect(master);
    weatherBus.connect(master);
    musicBus.connect(master);

    this.context = context;
    this.master = master;
    this.ambienceBus = ambienceBus;
    this.boatBus = boatBus;
    this.weatherBus = weatherBus;
    this.musicBus = musicBus;
    this.applyChannelGains(true);
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.ambientNoise = this.createNoiseBuffer(7.3, 0.28, true);
    this.boatNoise = this.createNoiseBuffer(5.1, 0.55, false);
    this.oneShotNoise = this.createNoiseBuffer(2.4, 0.34, false);
    void this.loadNaturalSamples();
    this.wind = this.createNoiseBus({
      filterType: "bandpass",
      frequency: 510,
      q: 0.42,
      destination: ambienceBus,
      stereo: true,
    });
    this.openWater = this.createNoiseBus({
      filterType: "lowpass",
      frequency: 330,
      q: 0.38,
      destination: ambienceBus,
      stereo: true,
    });
    this.shore = this.createNoiseBus({
      filterType: "bandpass",
      frequency: 1_650,
      q: 0.35,
      destination: ambienceBus,
      stereo: true,
    });
    this.hull = this.createNoiseBus({
      filterType: "lowpass",
      frequency: 280,
      q: 0.5,
      destination: boatBus,
    });
    this.luff = this.createNoiseBus({
      filterType: "bandpass",
      frequency: 1_320,
      q: 0.7,
      destination: boatBus,
    });
    this.stall = this.createNoiseBus({
      filterType: "bandpass",
      frequency: 540,
      q: 0.44,
      destination: boatBus,
    });
    this.rain = this.createNoiseBus({
      filterType: "highpass",
      frequency: 2_850,
      q: 0.32,
      destination: weatherBus,
      stereo: true,
    });
    this.setupMusic();
    this.resetEventSchedule();
    await context.resume();
    if (this.settings.musicEnabled) {
      await this.playMusic();
    }
    this.notifyMusicState();
  }

  setSeed(seed: number): void {
    if (!audioSeedChanged(this.seed, seed)) return;
    this.restartSeededEvents(seed);
  }

  restartSeededEvents(seed = this.seed): void {
    this.seed = seed;
    this.random = createRandom(seed ^ 0x41534d52);
    this.resetEventSchedule();
  }

  resetMotionState(): void {
    this.previousBoomAngle = undefined;
    this.previousSheet = undefined;
    this.previousLuff = 0;
  }

  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.persistSettings();
    this.applyChannelGains();
    return this.settings.muted;
  }

  setChannelVolume(channel: AudioChannel, volume: number): void {
    this.settings.volumes[channel] = clamp(volume, 0, 1);
    this.persistSettings();
    this.applyChannelGains();
  }

  async toggleMusicPlayback(): Promise<MusicPlaybackState> {
    if (!this.context) {
      this.settings.musicEnabled = true;
      this.persistSettings();
      await this.start();
      return this.getMusicState();
    }
    if (!this.musicElement) return this.getMusicState();
    if (!this.musicElement.paused) {
      this.musicElement.pause();
      this.settings.musicEnabled = false;
    } else {
      this.settings.musicEnabled = true;
      await this.playMusic();
    }
    this.persistSettings();
    this.notifyMusicState();
    return this.getMusicState();
  }

  async selectMusicTrack(trackId: string): Promise<MusicPlaybackState> {
    const track = findMusicTrack(trackId);
    if (!track) return this.getMusicState();
    const wasPlaying = Boolean(
      this.musicElement && !this.musicElement.paused,
    );
    this.settings.trackId = track.id;
    this.persistSettings();
    this.loadSelectedTrack();
    if (wasPlaying) await this.playMusic();
    this.notifyMusicState();
    return this.getMusicState();
  }

  async nextMusicTrack(): Promise<MusicPlaybackState> {
    return this.stepMusicTrack(1);
  }

  async previousMusicTrack(): Promise<MusicPlaybackState> {
    return this.stepMusicTrack(-1);
  }

  update(
    weather: WeatherSnapshot,
    state: BoatState,
    sail: SailDiagnostics,
    soundscape: SoundscapeSnapshot,
  ): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (this.lastUpdateAt > 0 && now - this.lastUpdateAt < 1 / 30) return;
    const mix = computeAudioMixTargets(weather, state, sail, soundscape);

    this.wind?.gain.setTargetAtTime(mix.wind, now, 1.15);
    this.openWater?.gain.setTargetAtTime(mix.openWater, now, 2.8);
    this.shore?.gain.setTargetAtTime(mix.shore, now, 4.2);
    this.hull?.gain.setTargetAtTime(mix.hull, now, 0.65);
    this.luff?.gain.setTargetAtTime(mix.luff, now, 0.075);
    this.stall?.gain.setTargetAtTime(mix.stall, now, 0.32);
    this.rain?.gain.setTargetAtTime(mix.rain, now, 0.9);
    const teachingCue = clamp(
      Math.max(sail.luff, sail.stall) *
        clamp((sail.apparentWindSpeed - 1.5) / 5, 0, 1) +
        weather.rain * 0.22,
      0,
      1,
    );
    this.musicDucker?.gain.setTargetAtTime(
      lerp(1, 0.62, teachingCue),
      now,
      0.38,
    );

    const suppressEvents =
      this.settings.muted || document.visibilityState === "hidden";
    if (suppressEvents) {
      this.eventsSuppressed = true;
    } else {
      if (
        audioEventsNeedRebase(
          this.eventsSuppressed,
          this.lastUpdateAt,
          now,
        )
      ) {
        this.resetEventSchedule();
      }
      this.scheduleEvents(now, state, sail, mix);
      this.eventsSuppressed = false;
    }
    this.lastUpdateAt = now;
    this.previousBoomAngle = state.boomAngle;
    this.previousSheet = state.sheet;
    this.previousLuff = sail.luff;
  }

  private scheduleEvents(
    now: number,
    state: BoatState,
    sail: SailDiagnostics,
    mix: AudioMixTargets,
  ): void {
    if (now >= this.nextBirdAt) {
      if (mix.birdActivity > 0.06) {
        const waterbird = this.random() < mix.waterbirdShare;
        this.playBirdCall(now, mix.birdActivity, waterbird);
      }
      const interval = lerp(44, 10, mix.birdActivity);
      this.nextBirdAt = now + interval * (0.72 + this.random() * 0.72);
    }

    if (now >= this.nextCreakAt) {
      if (mix.boatMotion > 0.16) {
        this.playCreak(now, mix.boatMotion, false);
        const interval = lerp(9.5, 3.2, mix.boatMotion);
        this.nextCreakAt = now + interval * (0.78 + this.random() * 0.68);
      } else {
        this.nextCreakAt = now + 2.4;
      }
    }

    if (now >= this.nextLapAt) {
      if (mix.boatMotion > 0.1 || mix.hull > 0.006) {
        this.playNoiseBurst(now, {
          frequency: 340 + this.random() * 90,
          q: 0.5,
          duration: 0.55 + this.random() * 0.25,
          level: 0.008 + mix.boatMotion * 0.01,
          playbackRate: 0.72 + this.random() * 0.22,
        });
        const interval = lerp(5.2, 1.9, mix.boatMotion);
        this.nextLapAt = now + interval * (0.76 + this.random() * 0.66);
      } else {
        this.nextLapAt = now + 1.8;
      }
    }

    if (now >= this.nextDockAt) {
      if (mix.dockActivity > 0.18) {
        this.playCreak(now, mix.dockActivity * 0.62, true);
      }
      const interval = lerp(22, 9, mix.dockActivity);
      this.nextDockAt = now + interval * (0.78 + this.random() * 0.78);
    }

    const boomDelta =
      this.previousBoomAngle === undefined
        ? 0
        : Math.abs(state.boomAngle - this.previousBoomAngle);
    const sheetDelta =
      this.previousSheet === undefined
        ? 0
        : Math.abs(state.sheet - this.previousSheet);
    if (
      now - this.lastRopeAt > 0.72 &&
      (boomDelta > 0.008 || sheetDelta > 0.0015)
    ) {
      this.playNoiseBurst(now, {
        frequency: 900 + this.random() * 280,
        q: 2.4,
        duration: 0.085,
        level: 0.006 + Math.min(boomDelta * 0.12, 0.004),
        playbackRate: 1.25 + this.random() * 0.45,
      });
      this.lastRopeAt = now;
    }

    if (
      now - this.lastFillAt > 1.5 &&
      this.previousLuff > 0.58 &&
      sail.attached > 0.68
    ) {
      this.playNoiseBurst(now, {
        frequency: 680,
        q: 0.55,
        duration: 0.36,
        level: 0.012,
        playbackRate: 0.9,
      });
      this.lastFillAt = now;
    }
  }

  private playBirdCall(
    now: number,
    activity: number,
    waterbird: boolean,
  ): void {
    const sample = waterbird
      ? this.waterbirdSample
      : this.songbirdSample;
    if (sample) {
      this.playBirdSample(now, activity, waterbird, sample);
      return;
    }
    const context = this.context;
    const destination = this.ambienceBus;
    if (!context || !destination) return;
    const chirps = waterbird ? 2 : 3;
    const base = waterbird
      ? 720 + this.random() * 230
      : 1_850 + this.random() * 820;
    for (let index = 0; index < chirps; index += 1) {
      const start = now + index * (waterbird ? 0.18 : 0.105);
      const duration = waterbird ? 0.22 : 0.115;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      oscillator.type = "sine";
      const startFrequency = base * (1 + index * 0.045);
      const endFrequency = waterbird
        ? startFrequency * 0.76
        : startFrequency * (1.28 + this.random() * 0.16);
      oscillator.frequency.setValueAtTime(startFrequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + duration,
      );
      filter.type = "bandpass";
      filter.frequency.value = base;
      filter.Q.value = waterbird ? 1.2 : 2.1;
      const peak = (waterbird ? 0.0045 : 0.0038) + activity * 0.0045;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + duration,
      );
      oscillator.connect(filter).connect(gain).connect(destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }
  }

  private playBirdSample(
    now: number,
    activity: number,
    waterbird: boolean,
    buffer: AudioBuffer,
  ): void {
    const context = this.context;
    const destination = this.ambienceBus;
    if (!context || !destination) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const duration = Math.min(
      buffer.duration,
      waterbird ? 5.2 + this.random() * 1.8 : 2.8 + this.random() * 1.4,
    );
    const maximumOffset = Math.max(0, buffer.duration - duration);
    const offset = maximumOffset * this.random();
    const peak = (waterbird ? 0.017 : 0.014) + activity * 0.012;
    source.buffer = buffer;
    source.playbackRate.value = 0.97 + this.random() * 0.06;
    filter.type = "highpass";
    filter.frequency.value = waterbird ? 170 : 420;
    filter.Q.value = 0.35;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.24);
    gain.gain.setValueAtTime(peak, now + Math.max(0.25, duration - 0.55));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(now, offset, duration);
  }

  private playCreak(
    now: number,
    intensity: number,
    distant: boolean,
  ): void {
    const context = this.context;
    const destination = distant ? this.ambienceBus : this.boatBus;
    if (!context || !destination) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const duration = 0.32 + this.random() * 0.25;
    const startFrequency =
      (distant ? 95 : 125) + this.random() * (distant ? 22 : 38);
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      startFrequency * (0.62 + this.random() * 0.12),
      now + duration,
    );
    filter.type = "lowpass";
    filter.frequency.value = distant ? 410 : 640;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      0.0035 + intensity * 0.006,
      now + 0.055,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(filter).connect(gain).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  private playNoiseBurst(
    now: number,
    options: {
      frequency: number;
      q: number;
      duration: number;
      level: number;
      playbackRate: number;
    },
  ): void {
    const context = this.context;
    const destination = this.boatBus;
    const buffer = this.oneShotNoise;
    if (!context || !destination || !buffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate;
    filter.type = "bandpass";
    filter.frequency.value = options.frequency;
    filter.Q.value = options.q;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      options.level,
      now + Math.min(0.045, options.duration * 0.22),
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + options.duration,
    );
    source.connect(filter).connect(gain).connect(destination);
    const availableOffset = Math.max(
      0,
      buffer.duration - options.duration * options.playbackRate,
    );
    source.start(now, this.random() * availableOffset);
    source.stop(now + options.duration + 0.04);
  }

  private createNoiseBus(options: NoiseBusOptions): GainNode {
    const context = this.context!;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const buffer = options.stereo ? this.ambientNoise : this.boatNoise;
    if (!buffer) {
      throw new Error("Audio noise buffers must exist before buses are created.");
    }
    source.buffer = buffer;
    source.loop = true;
    filter.type = options.filterType;
    filter.frequency.value = options.frequency;
    filter.Q.value = options.q;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(options.destination);
    source.start(0, this.random() * buffer.duration);
    return gain;
  }

  private createNoiseBuffer(
    seconds: number,
    smoothing: number,
    stereo: boolean,
  ): AudioBuffer {
    const context = this.context!;
    const channels = stereo ? 2 : 1;
    const buffer = context.createBuffer(
      channels,
      Math.round(context.sampleRate * seconds),
      context.sampleRate,
    );
    const noiseRandom = createRandom(
      this.seed ^
        Math.round(seconds * 10_000) ^
        Math.round(smoothing * 1_000) ^
        channels,
    );
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      let previous = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const white = noiseRandom() * 2 - 1;
        previous = previous * smoothing + white * (1 - smoothing);
        samples[index] = previous;
      }
    }
    return buffer;
  }

  private setupMusic(): void {
    const context = this.context;
    const musicBus = this.musicBus;
    if (!context || !musicBus) return;
    const element = new Audio();
    const source = context.createMediaElementSource(element);
    const ducker = context.createGain();
    element.preload = "metadata";
    element.addEventListener("play", () => this.notifyMusicState());
    element.addEventListener("pause", () => this.notifyMusicState());
    element.addEventListener("loadedmetadata", () =>
      this.notifyMusicState(),
    );
    element.addEventListener("ended", () => {
      void this.stepMusicTrack(1, true);
    });
    ducker.gain.value = 1;
    source.connect(ducker).connect(musicBus);
    this.musicElement = element;
    this.musicDucker = ducker;
    this.loadSelectedTrack();
  }

  private loadSelectedTrack(): void {
    const element = this.musicElement;
    if (!element) return;
    const track =
      findMusicTrack(this.settings.trackId) ??
      MUSIC_TRACKS[0]!;
    element.src = track.source;
    element.load();
  }

  private async playMusic(): Promise<boolean> {
    const context = this.context;
    const element = this.musicElement;
    if (!context || !element) return false;
    try {
      await context.resume();
      await element.play();
      this.notifyMusicState();
      return true;
    } catch {
      this.notifyMusicState();
      return false;
    }
  }

  private async stepMusicTrack(
    offset: number,
    forcePlay = false,
  ): Promise<MusicPlaybackState> {
    const currentIndex = Math.max(
      0,
      MUSIC_TRACKS.findIndex(
        (track) => track.id === this.settings.trackId,
      ),
    );
    const nextIndex =
      (currentIndex + offset + MUSIC_TRACKS.length) %
      MUSIC_TRACKS.length;
    const shouldPlay =
      forcePlay ||
      Boolean(this.musicElement && !this.musicElement.paused);
    this.settings.trackId = MUSIC_TRACKS[nextIndex]!.id;
    if (forcePlay) this.settings.musicEnabled = true;
    this.persistSettings();
    this.loadSelectedTrack();
    if (shouldPlay) await this.playMusic();
    this.notifyMusicState();
    return this.getMusicState();
  }

  private applyChannelGains(immediate = false): void {
    const now = this.context?.currentTime ?? 0;
    const apply = (
      node: GainNode | undefined,
      value: number,
      timeConstant = 0.12,
    ) => {
      if (!node) return;
      if (immediate) node.gain.value = value;
      else node.gain.setTargetAtTime(value, now, timeConstant);
    };
    apply(this.master, this.masterGain());
    apply(
      this.musicBus,
      volumeGain(this.settings.volumes.music),
      0.22,
    );
    apply(
      this.ambienceBus,
      volumeGain(this.settings.volumes.ambience),
      0.22,
    );
    apply(this.boatBus, volumeGain(this.settings.volumes.boat), 0.18);
    apply(
      this.weatherBus,
      volumeGain(this.settings.volumes.weather),
      0.22,
    );
  }

  private masterGain(): number {
    return this.settings.muted
      ? 0
      : MASTER_OUTPUT_SCALE *
          volumeGain(this.settings.volumes.master);
  }

  private persistSettings(): void {
    saveAudioSettings(this.settings);
  }

  private notifyMusicState(): void {
    this.musicStateListener?.(this.getMusicState());
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      this.eventsSuppressed = true;
    }
  };

  private async loadNaturalSamples(): Promise<void> {
    const [songbird, waterbird] = await Promise.all([
      this.loadSample("/audio/wood-pigeon.ogg"),
      this.loadSample("/audio/loon-calls.ogg"),
    ]);
    this.songbirdSample = songbird;
    this.waterbirdSample = waterbird;
  }

  private async loadSample(url: string): Promise<AudioBuffer | undefined> {
    const context = this.context;
    if (!context) return undefined;
    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      return undefined;
    }
  }

  private resetEventSchedule(): void {
    const now = this.context?.currentTime ?? 0;
    this.nextBirdAt = now + 6 + this.random() * 8;
    this.nextCreakAt = now + 2.5 + this.random() * 3;
    this.nextLapAt = now + 1.5 + this.random() * 2;
    this.nextDockAt = now + 8 + this.random() * 8;
    this.lastRopeAt = -Infinity;
    this.lastFillAt = -Infinity;
    this.resetMotionState();
  }
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function volumeGain(value: number): number {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
