import "./style.css";
import {
  GameAudio,
  type MusicPlaybackState,
} from "./audio/game-audio";
import {
  MUSIC_TRACKS,
  musicPlaybackStatus,
} from "./audio/music";
import type { AudioChannel } from "./audio/settings";
import { sampleSoundscape } from "./audio/zones";
import {
  evaluateIncident,
  type IncidentResult,
} from "./game/hazards";
import { GameInput } from "./game/input";
import { LakeChart } from "./game/minimap";
import { timeScaleForHold } from "./game/time-scale";
import { TrimLesson } from "./game/lesson";
import { sampleBoatWavePose } from "./game/wave-pose";
import {
  FAIR_WINDS_WORLD,
  type WorldActivity,
} from "./game/world-definition";
import { LANDMARKS, SailingWorld } from "./render/world";
import { bindTabList, trapFocusWithin, type TabListController } from "./ui/primitives";
import {
  HARBOR_20,
  getBoatDefinition,
  getSailDefinition,
  type BoatDefinition,
  type BoatId,
} from "./sim/boats";
import {
  computeHeadsailAerodynamics,
  computeSailAerodynamics,
  createInitialState,
  degrees,
  pointOfSail,
  radiansToDegrees,
  sailDeploymentTarget,
  sheetForBoomAngle,
  stepBoat,
  type BoatState,
  type SailDiagnostics,
} from "./sim/model";
import {
  DEFAULT_WEATHER,
  SEA_STATE_PRESETS,
  WEATHER_PRESETS,
  cloneWeatherConfig,
  type WeatherConfig,
  type WeatherSnapshot,
} from "./weather/types";
import { WeatherSystem } from "./weather/weather";

const canvas = required<HTMLCanvasElement>("#lake");
const elements = {
  gameShell: required(".game-shell"),
  minimap: required<HTMLCanvasElement>("#minimap"),
  pointOfSail: required("#point-of-sail"),
  wind: required("#wind-readout"),
  windArrow: required("#wind-arrow"),
  speed: required("#speed"),
  motion: required("#motion-readout"),
  sailPlanLabel: required("#sail-plan-label"),
  flow: required("#flow-state"),
  coach: required("#coach"),
  marker: required("#trim-marker"),
  target: required("#trim-target"),
  boom: required("#boom-readout"),
  lessonCard: required("#lesson-card"),
  lessonEyebrow: required("#lesson-eyebrow"),
  lessonTitle: required("#lesson-title"),
  lessonInstruction: required("#lesson-instruction"),
  lessonProgress: required("#lesson-progress"),
  lessonSkip: required<HTMLButtonElement>("#lesson-skip"),
  destinationName: required("#destination-name"),
  destinationDistance: required("#destination-distance"),
  heading: required("#heading-readout"),
  headingCardinal: required("#heading-cardinal"),
  depthPanel: required("#depth-panel"),
  depth: required("#depth-readout"),
  depthState: required("#depth-state"),
  status: required("#status"),
  welcome: required("#welcome"),
  setSail: required<HTMLButtonElement>("#set-sail"),
  newJourney: required<HTMLButtonElement>("#new-journey"),
  titleSettings: required<HTMLButtonElement>("#title-settings"),
  titleMute: required<HTMLButtonElement>("#title-mute"),
  mute: required<HTMLButtonElement>("#mute"),
  reset: required<HTMLButtonElement>("#reset"),
  reefSail: required<HTMLButtonElement>("#reef-sail"),
  toggleSails: required<HTMLButtonElement>("#toggle-sails"),
  conditionsToggle: required<HTMLButtonElement>("#conditions-toggle"),
  mapToggle: required<HTMLButtonElement>("#map-toggle"),
  chartPanel: required("#chart-panel"),
  chartBackdrop: required("#chart-backdrop"),
  chartClose: required<HTMLButtonElement>("#chart-close"),
  chartCanvas: required<HTMLCanvasElement>("#lake-chart"),
  chartActivityList: required("#chart-activity-list"),
  chartCourseReadout: required("#chart-course-readout"),
  conditionsClose: required<HTMLButtonElement>("#conditions-close"),
  conditionsPanel: required("#conditions-panel"),
  conditionsBackdrop: required("#conditions-backdrop"),
  settingsResume: required<HTMLButtonElement>("#settings-resume"),
  settingsMainMenu: required<HTMLButtonElement>("#settings-main-menu"),
  settingsResetBoat: required<HTMLButtonElement>("#settings-reset-boat"),
  touchControlsEnabled: required<HTMLInputElement>("#touch-controls-enabled"),
  boatSelect: required<HTMLSelectElement>("#boat-select"),
  musicTrackName: required("#music-track-name"),
  musicPlaybackStatus: required("#music-playback-status"),
  musicPrevious: required<HTMLButtonElement>("#music-previous"),
  musicToggle: required<HTMLButtonElement>("#music-toggle"),
  musicNext: required<HTMLButtonElement>("#music-next"),
  musicTrackSelect: required<HTMLSelectElement>("#music-track-select"),
  incident: required("#incident"),
  incidentTitle: required("#incident-title"),
  incidentBody: required("#incident-body"),
  incidentRecover: required<HTMLButtonElement>("#incident-recover"),
  incidentRestart: required<HTMLButtonElement>("#incident-restart"),
  fatal: required("#fatal-error"),
};

let activeBoat: BoatDefinition = loadBoatDefinition();
let world: SailingWorld;
let bootComplete = false;
try {
  world = new SailingWorld(canvas);
  world.setBoat(activeBoat);
} catch (error) {
  elements.fatal.hidden = false;
  elements.fatal.textContent = "Fair Winds needs WebGL to draw the lake. Try an up-to-date browser with hardware acceleration enabled.";
  finishBoot();
  throw error;
}
const input = new GameInput();
const chart = new LakeChart(elements.chartCanvas);
const miniChart = new LakeChart(elements.minimap);
const lesson = new TrimLesson();
let weatherConfig = loadWeatherConfig();
const audio = new GameAudio(weatherConfig.seed);
const weatherSystem = new WeatherSystem(weatherConfig);
const titleWeatherSystem = new WeatherSystem(createTitleWeatherConfig());
let state = createGameState();
let previousState = state;
let simulationTime = 0;
let weather = weatherSystem.sample(simulationTime);
let diagnostics = computeSailAerodynamics(state, {
  trueWind: weather.trueWind,
  boat: activeBoat,
});
let headsailDiagnostics = computeHeadsailAerodynamics(state, {
  trueWind: weather.trueWind,
  boat: activeBoat,
});
let previousFrame = performance.now();
let accumulator = 0;
let started = false;
let lastFlow = "";
let lastManeuverCount = 0;
let lessonCompletedAt = 0;
let incident: IncidentResult | undefined;
let incidentElapsed = 0;
let touchCooldown = 0;
let presentationTime = 0;
let hudUpdateElapsed = 0;
let developmentPreviewFrozen = false;
let titleAudioPromise: Promise<void> | undefined;
let settingsTabs: TabListController;
let selectedActivityId = FAIR_WINDS_WORLD.activities[0]?.id;
const fixedStep = 1 / 60;
const titleState = createTitleState();
let titleWeather = titleWeatherSystem.sample(0);
let titleDiagnostics = computeSailAerodynamics(titleState, {
  trueWind: titleWeather.trueWind,
  boat: activeBoat,
});
let titleHeadsailDiagnostics = computeHeadsailAerodynamics(titleState, {
  trueWind: titleWeather.trueWind,
  boat: activeBoat,
});

bindInterface();
world.resize();
syncWeatherControls();
syncAudioControls();
updateHud();
enableDevelopmentPreview();
requestAnimationFrame(loop);

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function createGameState(
  spawn = FAIR_WINDS_WORLD.spawn,
): BoatState {
  const initial = createInitialState();
  initial.position = { x: spawn.x, y: spawn.z };
  initial.heading = spawn.heading;
  initial.sheet = 0.93;
  initial.boomAngle = -degrees(79);
  return initial;
}

function createTitleState(): BoatState {
  const title = createGameState({
    x: 610,
    z: 790,
    heading: degrees(192),
  });
  title.sheet = 0.58;
  title.boomAngle = -degrees(46);
  title.headsailSheet = 0.54;
  title.headsailAngle = -degrees(35);
  return title;
}

function createTitleWeatherConfig(): WeatherConfig {
  return {
    ...cloneWeatherConfig(DEFAULT_WEATHER),
    mode: "manual",
    timeScale: 1,
    timeOfDay: 6.65,
    wind: {
      ...DEFAULT_WEATHER.wind,
      speed: 4.4,
      directionFromDegrees: 96,
      gustStrength: 0,
    },
    waves: {
      ...DEFAULT_WEATHER.waves,
      mode: "manual",
      height: 0.18,
      length: 12,
      steepness: 0.14,
      directionFromDegrees: 104,
    },
    rain: 0,
    cloud: 0.16,
    visibility: 1,
  };
}

function bindInterface(): void {
  window.addEventListener("resize", () => {
    world.resize();
    if (isChartOpen()) renderChart();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && isChartOpen()) {
      event.preventDefault();
      setChartOpen(false);
      return;
    }
    if (event.code === "Escape" && isConditionsOpen()) {
      event.preventDefault();
      setConditionsOpen(false);
      return;
    }
    if (event.code === "Tab" && isChartOpen()) {
      trapFocusWithin(elements.chartPanel, event);
      return;
    }
    if (event.code === "Tab" && isConditionsOpen()) {
      trapFocusWithin(elements.conditionsPanel, event);
      return;
    }
    if (!event.repeat && event.code === "KeyN" && started) {
      event.preventDefault();
      setChartOpen(!isChartOpen());
      return;
    }
    if (!started && !isConditionsOpen()) {
      void startTitleAudio();
      if (event.code === "ArrowDown" || event.code === "ArrowUp") {
        event.preventDefault();
        moveTitleSelection(event.code === "ArrowDown" ? 1 : -1);
      }
    }
  });
  elements.welcome.addEventListener("pointerdown", () => {
    void startTitleAudio();
  });
  titleMenuItems().forEach((item) => {
    item.addEventListener("focus", () => selectTitleItem(item));
    item.addEventListener("pointerenter", () => selectTitleItem(item));
  });
  elements.setSail.addEventListener("click", () => {
    void beginSailing(false);
  });
  elements.newJourney.addEventListener("click", () => {
    void beginSailing(true);
  });
  elements.titleSettings.addEventListener("click", () => {
    void startTitleAudio();
    setConditionsOpen(true);
  });
  elements.titleMute.addEventListener("click", () => {
    void startTitleAudio();
    toggleMute();
  });
  elements.mute.addEventListener("click", toggleMute);
  elements.reset.addEventListener("click", resetBoat);
  elements.lessonSkip.addEventListener("click", () => {
    lesson.skip();
    lessonCompletedAt = simulationTime;
    updateLesson();
  });
  elements.mapToggle.addEventListener("click", () => setChartOpen(!isChartOpen()));
  elements.chartClose.addEventListener("click", () => setChartOpen(false));
  elements.chartBackdrop.addEventListener("click", () => setChartOpen(false));
  elements.conditionsToggle.addEventListener("click", () => setConditionsOpen(!isConditionsOpen()));
  elements.conditionsClose.addEventListener("click", () => setConditionsOpen(false));
  elements.conditionsBackdrop.addEventListener("click", () => setConditionsOpen(false));
  elements.settingsResume.addEventListener("click", () => setConditionsOpen(false));
  elements.settingsMainMenu.addEventListener("click", returnToTitle);
  elements.settingsResetBoat.addEventListener("click", resetBoat);
  const storedOnScreenControls = localStorage.getItem(
    "fair-winds-on-screen-controls",
  );
  elements.touchControlsEnabled.checked =
    storedOnScreenControls === null
      ? window.matchMedia("(hover: none), (pointer: coarse)").matches
      : storedOnScreenControls === "true";
  syncOnScreenControls();
  elements.touchControlsEnabled.addEventListener("change", () => {
    localStorage.setItem(
      "fair-winds-on-screen-controls",
      String(elements.touchControlsEnabled.checked),
    );
    syncOnScreenControls();
  });
  settingsTabs = bindTabList(elements.conditionsPanel);
  buildChartActivityList();
  elements.incidentRecover.addEventListener("click", recoverBoat);
  elements.incidentRestart.addEventListener("click", resetBoat);
  elements.boatSelect.addEventListener("change", () => {
    selectBoat(elements.boatSelect.value as BoatId);
  });
  bindWeatherControls();
  bindAudioControls();
}

function titleMenuItems(): HTMLButtonElement[] {
  return [
    elements.setSail,
    elements.newJourney,
    elements.titleSettings,
  ];
}

function selectTitleItem(selected: HTMLButtonElement): void {
  for (const item of titleMenuItems()) {
    item.classList.toggle("is-selected", item === selected);
  }
}

function moveTitleSelection(direction: -1 | 1): void {
  const items = titleMenuItems();
  const focused = document.activeElement;
  const current = Math.max(
    items.findIndex((item) => item === focused || item.classList.contains("is-selected")),
    0,
  );
  const next = items[(current + direction + items.length) % items.length]!;
  selectTitleItem(next);
  next.focus({ preventScroll: true });
}

async function startTitleAudio(): Promise<void> {
  if (titleAudioPromise) return titleAudioPromise;
  titleAudioPromise = (async () => {
    try {
      await audio.start();
      await audio.selectMusicTrack("fair-winds");
      syncAudioControls();
    } catch {
      elements.status.textContent =
        "Audio is unavailable; sailing will continue silently.";
    }
  })();
  return titleAudioPromise;
}

async function beginSailing(newJourney: boolean): Promise<void> {
  await startTitleAudio();
  if (newJourney) resetJourney();
  started = true;
  world.resetCamera();
  elements.gameShell.classList.remove("is-welcome");
  elements.welcome.classList.add("is-leaving");
  window.setTimeout(() => {
    elements.welcome.hidden = true;
  }, 540);
  hudUpdateElapsed = 0;
  updateHud();
  elements.status.textContent = newJourney
    ? "New journey. Sheet in gently until the mainsail stops luffing."
    : "Set sail. Sheet in gently until the mainsail stops luffing.";
}

function returnToTitle(): void {
  setConditionsOpen(false);
  setChartOpen(false);
  started = false;
  elements.welcome.hidden = false;
  elements.welcome.classList.remove("is-leaving");
  elements.gameShell.classList.add("is-welcome");
  selectTitleItem(elements.setSail);
  elements.setSail.focus({ preventScroll: true });
  audio.resetMotionState();
  elements.status.textContent = "Main menu. Your journey is ready to continue.";
}

function syncOnScreenControls(): void {
  elements.gameShell.classList.toggle(
    "show-on-screen-controls",
    elements.touchControlsEnabled.checked,
  );
}

function resetJourney(): void {
  simulationTime = 0;
  weatherConfig = cloneWeatherConfig(DEFAULT_WEATHER);
  activeBoat = HARBOR_20;
  localStorage.setItem("fair-winds-boat", activeBoat.id);
  world.setBoat(activeBoat);
  refreshTitleDiagnostics();
  applyWeatherConfig(true);
  state = createGameState();
  previousState = state;
  diagnostics = computeSailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  headsailDiagnostics = computeHeadsailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  lesson.reset();
  lessonCompletedAt = 0;
  lastManeuverCount = 0;
  clearIncident();
  world.resetWake();
}

function refreshTitleDiagnostics(): void {
  titleDiagnostics = computeSailAerodynamics(titleState, {
    trueWind: titleWeather.trueWind,
    boat: activeBoat,
  });
  titleHeadsailDiagnostics = computeHeadsailAerodynamics(titleState, {
    trueWind: titleWeather.trueWind,
    boat: activeBoat,
  });
}

function enableDevelopmentPreview(): void {
  const localPreview =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";
  if (!import.meta.env.DEV && !localPreview) return;
  const parameters = new URLSearchParams(window.location.search);
  developmentPreviewFrozen = parameters.get("freeze") === "1";
  const preview = parameters.get("preview");
  const settingsStyle = parameters.get("settings")?.padStart(2, "0");
  if (settingsStyle && /^(0[1-9]|10)$/.test(settingsStyle)) {
    elements.conditionsPanel.dataset.settingsStyle = settingsStyle;
  }
  if (preview !== "game" && preview !== "impact") return;
  const previewBoat = parameters.get("boat");
  if (
    previewBoat === "harbor-20" ||
    previewBoat === "coastal-28" ||
    previewBoat === "lake-34"
  ) {
    activeBoat = getBoatDefinition(previewBoat);
    world.setBoat(activeBoat);
    state = createGameState();
    previousState = state;
    elements.boatSelect.value = activeBoat.id;
  }
  const seaState = parameters.get("sea");
  const seaStatePreset = SEA_STATE_PRESETS.find(
    (preset) => preset.id === seaState,
  );
  if (seaStatePreset) {
    weatherConfig = {
      ...weatherConfig,
      waves: {
        ...weatherConfig.waves,
        mode: "manual",
        height: seaStatePreset.height,
        length: seaStatePreset.length,
        steepness: seaStatePreset.steepness,
      },
    };
    weatherSystem.setConfig(weatherConfig);
    weather = weatherSystem.sample(simulationTime);
    syncWeatherControls();
  }
  started = true;
  state =
    preview === "impact"
      ? {
          ...state,
          position: { x: -580, y: 396 },
          heading: degrees(38),
          velocity: { x: 2.4, y: 0.6 },
          sheet: 0.48,
          boomAngle: -degrees(43),
        }
      : {
          ...state,
          sheet: 0.48,
          boomAngle: -degrees(43),
          velocity: { x: 0, y: 2.15 },
        };
  if (preview === "game" && parameters.get("landmark") === "north-light") {
    state = {
      ...state,
      position: { x: 600, y: 900 },
      heading: degrees(38),
      velocity: { x: 0, y: 0 },
    };
  }
  if (preview === "game") {
    const previewFlow = computeSailAerodynamics(state, {
      trueWind: weather.trueWind,
      boat: activeBoat,
    });
    state = {
      ...state,
      sheet: sheetForBoomAngle(previewFlow.idealBoomAngle),
      boomAngle:
        Math.sign(state.boomAngle || -1) *
        Math.abs(previewFlow.idealBoomAngle),
    };
  }
  previousState = state;
  diagnostics = computeSailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  headsailDiagnostics = computeHeadsailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  elements.welcome.hidden = true;
  elements.gameShell.classList.remove("is-welcome");
  if (preview === "impact") {
    const result = evaluateIncident(
      state,
      activeBoat,
      FAIR_WINDS_WORLD,
    );
    beginIncident(result);
    incidentElapsed = 1.7;
  }
  elements.status.textContent =
    `Development ${preview} preview. Audio remains muted until interaction.`;
  const settingsSection = parameters.get("section");
  if (settingsStyle) {
    settingsTabs.select(settingsSection ?? "weather");
    setConditionsOpen(true);
  }
}

function loop(now: number): void {
  const frameDt = Math.min(Math.max((now - previousFrame) / 1_000, 0), 0.1);
  previousFrame = now;
  presentationTime += frameDt;
  if (input.consumeMute()) toggleMute();
  if (input.consumeConditions()) setConditionsOpen(!isConditionsOpen());
  const simulationPaused = isSimulationPaused();
  const simulationTimeScale = timeScaleForHold(input.isFastForwarding());
  elements.gameShell.dataset.timeScale = `${simulationTimeScale}`;
  if (!simulationPaused && input.consumeReset()) resetBoat();
  if (input.consumeReef() && canHandleSails(simulationPaused)) toggleReef();
  if (input.consumeSails() && canHandleSails(simulationPaused)) toggleSails();
  accumulator = simulationPaused
    ? 0
    : Math.min(
        accumulator + frameDt * simulationTimeScale,
        fixedStep * 5 * simulationTimeScale,
      );

  while (accumulator >= fixedStep) {
    previousState = state;
    if (started) {
      simulationTime += fixedStep;
      weather = weatherSystem.sample(simulationTime);
      touchCooldown = Math.max(0, touchCooldown - fixedStep);
      if (incident) {
        incidentElapsed += fixedStep;
      } else {
        const wavePose = sampleBoatWavePose(
          state,
          weather.waves,
          weather.time,
          activeBoat,
        );
        const result = stepBoat(
          state,
          isConditionsOpen()
            ? { rudder: 0, sheetRate: 0 }
            : input.read(),
          {
            trueWind: weather.trueWind,
            wavePose,
            boat: activeBoat,
          },
          fixedStep,
        );
        const nextIncident = evaluateIncident(
          result.state,
          activeBoat,
          FAIR_WINDS_WORLD,
          weather.tideLevel,
        );
        if (nextIncident.severity === "touch") {
          state = {
            ...result.state,
            velocity: {
              x: result.state.velocity.x * -0.18,
              y: result.state.velocity.y * -0.18,
            },
          };
          if (touchCooldown <= 0) {
            elements.status.textContent = `Touched ${nextIncident.object?.name ?? "a marker"}. Steer clear and continue.`;
            touchCooldown = 2.5;
          }
        } else if (
          nextIncident.severity === "stranded" ||
          nextIncident.severity === "impact"
        ) {
          state = {
            ...result.state,
            velocity: { x: 0, y: 0 },
            yawRate: 0,
            rudderAngle: 0,
          };
          beginIncident(nextIncident);
        } else {
          state = result.state;
        }
        diagnostics = result.sail;
        headsailDiagnostics = result.headsail;
        if (!incident && lesson.update(fixedStep, diagnostics)) {
          const view = lesson.view();
          elements.status.textContent = `${view.title}. ${view.instruction}`;
          if (view.stage === "complete") lessonCompletedAt = simulationTime;
        }
      }
    }
    accumulator -= fixedStep;
  }

  let renderPrevious = previousState;
  let renderCurrent = state;
  let renderDiagnostics = diagnostics;
  let renderHeadsail = headsailDiagnostics;
  let renderWeather = weather;
  if (!started) {
    titleWeather = titleWeatherSystem.sample(presentationTime);
    const titlePose = sampleBoatWavePose(
      titleState,
      titleWeather.waves,
      titleWeather.time,
      activeBoat,
    );
    titleState.heave = titlePose.heave;
    titleState.heaveVelocity = titlePose.heaveVelocity ?? 0;
    titleState.wavePitch = titlePose.pitch * 0.82;
    titleState.wavePitchVelocity = titlePose.pitchVelocity ?? 0;
    titleState.waveRoll = titlePose.roll * 0.78;
    titleState.waveRollVelocity = titlePose.rollVelocity ?? 0;
    renderPrevious = titleState;
    renderCurrent = titleState;
    renderDiagnostics = titleDiagnostics;
    renderHeadsail = titleHeadsailDiagnostics;
    renderWeather = titleWeather;
  }

  world.render(
    renderPrevious,
    renderCurrent,
    renderDiagnostics,
    renderHeadsail,
    renderWeather,
    accumulator / fixedStep,
    frameDt,
    incident ? { result: incident, elapsed: incidentElapsed } : undefined,
    !started,
    presentationTime,
  );
  finishBoot();
  audio.update(
    renderWeather,
    renderCurrent,
    renderDiagnostics,
    sampleSoundscape(FAIR_WINDS_WORLD, renderCurrent.position),
  );
  if (started) {
    hudUpdateElapsed += frameDt;
    if (hudUpdateElapsed >= 0.1) {
      hudUpdateElapsed %= 0.1;
      updateHud();
    }
  }
  elements.gameShell.dataset.simulationTime = simulationTime.toFixed(3);
  requestAnimationFrame(loop);
}

function finishBoot(): void {
  if (bootComplete) return;
  bootComplete = true;
  document.documentElement.dataset.appReady = "true";
  window.setTimeout(() => {
    document.querySelector("#boot-loader")?.remove();
  }, 260);
}

function resetBoat(): void {
  state = createGameState();
  previousState = state;
  diagnostics = computeSailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  headsailDiagnostics = computeHeadsailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  lesson.reset();
  audio.resetMotionState();
  lessonCompletedAt = 0;
  lastManeuverCount = 0;
  clearIncident();
  world.resetWake();
  elements.status.textContent = "Boat reset. Sheet in gently to attach flow.";
}

function selectBoat(id: BoatId): void {
  const nextBoat = getBoatDefinition(id);
  if (!nextBoat) return;
  activeBoat = nextBoat;
  localStorage.setItem("fair-winds-boat", activeBoat.id);
  world.setBoat(activeBoat);
  refreshTitleDiagnostics();
  resetBoat();
  elements.boatSelect.value = activeBoat.id;
  elements.status.textContent =
    `${activeBoat.name} selected. Draft ${activeBoat.hull.draft.toFixed(2)} m.`;
}

function recoverBoat(): void {
  state = createGameState(FAIR_WINDS_WORLD.recoverySpawn);
  previousState = state;
  diagnostics = computeSailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  headsailDiagnostics = computeHeadsailAerodynamics(state, {
    trueWind: weather.trueWind,
    boat: activeBoat,
  });
  lesson.skip();
  audio.resetMotionState();
  lessonCompletedAt = simulationTime;
  lastManeuverCount = 0;
  clearIncident();
  world.resetWake();
  elements.status.textContent =
    "Recovered in deep water near the sailing school.";
}

function beginIncident(result: IncidentResult): void {
  incident = result;
  incidentElapsed = 0;
  elements.gameShell.classList.add("has-incident");
  elements.incident.dataset.severity = result.severity;
  if (result.kind === "grounding") {
    elements.incidentTitle.textContent =
      result.severity === "impact" ? "Hard aground" : "Grounded";
    elements.incidentBody.textContent =
      `The ${activeBoat.name} draws ${result.draft?.toFixed(1)} m and found ${result.depth?.toFixed(1)} m of water. The boat is stranded until recovered.`;
  } else {
    elements.incidentTitle.textContent =
      `Collision at ${result.object?.name ?? "an obstruction"}`;
    elements.incidentBody.textContent =
      "The run has ended. Check the chart, leave more room, and approach hazards at a controllable speed.";
  }
  elements.incident.hidden = false;
  requestAnimationFrame(() => elements.incident.classList.add("is-visible"));
  elements.status.textContent =
    `${elements.incidentTitle.textContent}. ${elements.incidentBody.textContent}`;
}

function clearIncident(): void {
  incident = undefined;
  incidentElapsed = 0;
  elements.gameShell.classList.remove("has-incident");
  elements.incident.classList.remove("is-visible");
  elements.incident.hidden = true;
}

function toggleMute(): void {
  const muted = audio.toggleMute();
  syncMuteControl();
  elements.status.textContent = muted ? "Sound muted." : "Sound on.";
}

function syncMuteControl(): void {
  const muted = audio.isMuted;
  for (const control of [elements.mute, elements.titleMute]) {
    control.setAttribute("aria-pressed", String(muted));
    control.classList.toggle("is-active", muted);
  }
  const titleLabel = muted ? "Unmute sound" : "Mute sound";
  elements.titleMute.setAttribute("aria-label", titleLabel);
  elements.titleMute.title = titleLabel;
  const label = elements.mute.querySelector<HTMLElement>(".action-label");
  if (label) label.textContent = muted ? "Muted" : "Sound";
}

function canHandleSails(simulationPaused: boolean): boolean {
  return started && !simulationPaused && !incident;
}

function toggleReef(): void {
  state = {
    ...state,
    reefLevel: state.reefLevel === 0 ? 1 : 0,
  };
  elements.status.textContent = state.reefLevel === 1
    ? "Reefing. Sail area is reducing for stronger conditions."
    : "Shaking out the reef. Full sail area is returning.";
  updateHud();
}

function toggleSails(): void {
  state = {
    ...state,
    sailsRaised: !state.sailsRaised,
  };
  elements.status.textContent = state.sailsRaised
    ? state.reefLevel === 1
      ? "Hoisting to the reefed setting."
      : "Hoisting full sail."
    : "Lowering sails. The boat will lose aerodynamic drive.";
  updateHud();
}

function updateHud(): void {
  const speedKnots = Math.hypot(state.velocity.x, state.velocity.y) * 1.94384;
  const windKnots = diagnostics.apparentWindSpeed * 1.94384;
  const windAngle = Math.round(Math.abs(radiansToDegrees(diagnostics.apparentWindAngle)));
  const pointOfSailName = pointOfSail(diagnostics.apparentWindAngle);
  const targetDeployment = sailDeploymentTarget(state);
  const sailMotion = !state.sailsRaised
    ? state.sailDeployment > 0.03 ? "Lowering" : "Lowered"
    : state.sailDeployment < targetDeployment - 0.03
      ? state.sailDeployment < 0.08 ? "Hoisting" : "Shaking out"
      : state.sailDeployment > targetDeployment + 0.03
        ? "Reefing"
        : undefined;
  const flow = sailMotion ?? (
    diagnostics.luff > 0.55
      ? "Luffing"
      : diagnostics.stall > 0.55
        ? "Stalled"
        : "Attached"
  );
  const coach = flow === "Lowered"
    ? "Hoist sail to make way"
    : flow === "Lowering"
      ? "Sail drive reducing"
      : flow === "Hoisting" || flow === "Shaking out"
        ? "Fuller sail returning"
        : flow === "Reefing"
          ? "Reduced sail settling"
          : pointOfSailName === "No-go zone"
            ? "Ease sail · hold a turn"
            : flow === "Luffing"
              ? "Sheet in or bear away"
              : flow === "Stalled"
                ? "Ease a little"
                : state.reefLevel === 1
                  ? "Reefed flow attached"
                  : "Flow attached";
  const rudderDegrees = Math.round(radiansToDegrees(state.rudderAngle));
  const boomDegrees = Math.round(Math.abs(radiansToDegrees(state.boomAngle)));
  const boomSide = state.boomAngle < 0 ? "port" : "starboard";

  elements.pointOfSail.textContent = pointOfSailName;
  elements.wind.textContent = `${windKnots.toFixed(1)} kn · ${windAngle}°`;
  elements.windArrow.style.transform = `rotate(${radiansToDegrees(diagnostics.apparentWindAngle)}deg)`;
  elements.speed.textContent = speedKnots.toFixed(1);
  const hasHeadsail = Boolean(getSailDefinition(activeBoat, "headsail"));
  elements.sailPlanLabel.textContent = flow === "Lowered"
    ? "Sails down"
    : state.reefLevel === 1
      ? hasHeadsail ? "Reefed main + jib" : "Reefed mainsail"
      : hasHeadsail ? "Main + jib" : "Mainsail";
  elements.motion.textContent = `Heel ${Math.round(Math.abs(radiansToDegrees(state.heel)))}° · ${Math.abs(rudderDegrees) < 2 ? "Rudder centered" : `Rudder ${Math.abs(rudderDegrees)}°`}`;
  elements.flow.textContent = flow;
  elements.flow.dataset.state = flow.toLowerCase();
  elements.coach.textContent = coach;
  elements.marker.style.left = `${state.sheet * 100}%`;
  elements.target.style.left = `${sheetForBoomAngle(diagnostics.idealBoomAngle) * 100}%`;
  elements.boom.textContent = `Boom ${boomDegrees}° ${boomSide}`;
  syncSailControls();
  updateLesson();
  updateDestination();
  updateNavigation();
  miniChart.render(state, FAIR_WINDS_WORLD, weather.trueWind, selectedActivity());
  const completedManeuver =
    state.maneuverCount !== lastManeuverCount && state.lastManeuver !== "none";
  if (completedManeuver) {
    elements.status.textContent = state.lastManeuver === "gybe"
      ? "Gybe complete. The boom crossed with the wind astern; steady the helm and retrim."
      : "Tack complete. Build speed on the new side and retrim.";
    lastManeuverCount = state.maneuverCount;
    lastFlow = flow;
  } else if (flow !== lastFlow && started) {
    elements.status.textContent = `${flow}. ${coach}.`;
    lastFlow = flow;
  }
}

function syncSailControls(): void {
  const reefed = state.reefLevel === 1;
  const lowered = !state.sailsRaised;
  elements.reefSail.setAttribute("aria-pressed", String(reefed));
  elements.reefSail.setAttribute(
    "aria-label",
    reefed ? "Shake out reef (Q)" : "Take in a reef (Q)",
  );
  elements.reefSail.classList.toggle("is-active", reefed);
  const reefLabel = elements.reefSail.querySelector<HTMLElement>(".rig-action-label");
  if (reefLabel) reefLabel.textContent = reefed ? "Shake out" : "Reef";
  elements.toggleSails.setAttribute("aria-pressed", String(lowered));
  elements.toggleSails.setAttribute(
    "aria-label",
    lowered ? "Hoist sails (X)" : "Lower sails (X)",
  );
  elements.toggleSails.classList.toggle("is-active", lowered);
  const sailLabel = elements.toggleSails.querySelector<HTMLElement>(".rig-action-label");
  if (sailLabel) sailLabel.textContent = lowered ? "Hoist" : "Lower";
}

function updateNavigation(): void {
  const heading = (
    Math.round(radiansToDegrees(state.heading)) % 360 +
    360
  ) % 360;
  const depth = Math.max(0, FAIR_WINDS_WORLD.sampleDepth(
    state.position.x,
    state.position.y,
  ) + weather.tideLevel);
  const depthLabel = depth < 10 ? depth.toFixed(1) : Math.round(depth).toString();
  const tideState = `${weather.tideTrend === "rising" ? "Rising" : "Falling"} ${weather.tideLevel >= 0 ? "+" : ""}${weather.tideLevel.toFixed(1)} m`;
  const depthState = `${depth < 3 ? "Shoal water" : depth < 10 ? "Shallow water" : "Clear below"} · ${tideState}`;
  elements.heading.textContent = heading.toString().padStart(3, "0");
  elements.headingCardinal.textContent = cardinalDirection(heading);
  elements.depth.textContent = depthLabel;
  elements.depthState.textContent = depthState;
  elements.depthState.dataset.state = depth < 3 ? "shoal" : depth < 10 ? "shallow" : "deep";
  elements.depthPanel.classList.toggle(
    "is-visible",
    depth < 10,
  );
}

function cardinalDirection(heading: number): string {
  const directions = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
  ];
  return directions[Math.round(heading / 45) % directions.length]!;
}

function updateLesson(): void {
  const view = lesson.view();
  elements.lessonEyebrow.textContent = view.eyebrow;
  elements.lessonTitle.textContent = view.title;
  elements.lessonInstruction.textContent = view.instruction;
  elements.lessonProgress.style.width = `${Math.min(view.progress, 1) * 100}%`;
  elements.lessonSkip.textContent = view.stage === "complete" ? "Lesson complete" : "Free Sail";
  elements.lessonSkip.disabled = view.stage === "complete";
  elements.lessonCard.classList.toggle("is-complete", view.stage === "complete");
  const shouldMinimize = view.stage === "complete" && simulationTime - lessonCompletedAt > 7;
  elements.lessonCard.classList.toggle("is-minimized", shouldMinimize);
}

function updateDestination(): void {
  const course = selectedActivity();
  if (course) {
    const distance = Math.hypot(
      course.x - state.position.x,
      course.z - state.position.y,
    );
    elements.destinationName.textContent = course.title;
    elements.destinationDistance.textContent = formatChartDistance(distance);
    return;
  }
  let nearest = LANDMARKS[0]!;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const landmark of LANDMARKS) {
    const dx = landmark.x - state.position.x;
    const dz = landmark.z - state.position.y;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= nearestDistanceSquared) continue;
    nearest = landmark;
    nearestDistanceSquared = distanceSquared;
  }
  const distance = Math.sqrt(nearestDistanceSquared);
  elements.destinationName.textContent = nearest.name;
  elements.destinationDistance.textContent = formatChartDistance(distance);
}

function buildChartActivityList(): void {
  elements.chartActivityList.replaceChildren();
  FAIR_WINDS_WORLD.activities.forEach((activity, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chart-activity";
    button.dataset.activityId = activity.id;
    button.setAttribute(
      "aria-label",
      `Set course for ${activity.title}. ${activity.objective}`,
    );

    const marker = document.createElement("span");
    marker.className = "chart-activity-index";
    const markerNumber = document.createElement("span");
    markerNumber.textContent = String(index + 1);
    marker.append(markerNumber);

    const copy = document.createElement("span");
    copy.className = "chart-activity-copy";
    const title = document.createElement("strong");
    title.textContent = activity.title;
    const meta = document.createElement("span");
    meta.textContent = `${activity.kind} · ${activity.area} · ${activity.difficulty}`;
    const objective = document.createElement("small");
    objective.textContent = activity.objective;
    copy.append(title, meta, objective);

    const distance = document.createElement("span");
    distance.className = "chart-activity-distance";
    button.append(marker, copy, distance);
    button.addEventListener("click", () => selectChartActivity(activity.id));
    elements.chartActivityList.append(button);
  });
  syncChartActivityList();
}

function selectedActivity(): WorldActivity | undefined {
  return FAIR_WINDS_WORLD.activities.find(
    (activity) => activity.id === selectedActivityId,
  );
}

function selectChartActivity(id: string): void {
  selectedActivityId = id;
  syncChartActivityList();
  renderChart();
  updateDestination();
  const activity = selectedActivity();
  if (activity) {
    elements.status.textContent =
      `Course set for ${activity.title}. ${activity.objective}`;
  }
}

function syncChartActivityList(): void {
  for (const button of elements.chartActivityList.querySelectorAll<HTMLButtonElement>(
    "[data-activity-id]",
  )) {
    const activity = FAIR_WINDS_WORLD.activities.find(
      (candidate) => candidate.id === button.dataset.activityId,
    );
    if (!activity) continue;
    const selected = activity.id === selectedActivityId;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    const distance = Math.hypot(
      activity.x - state.position.x,
      activity.z - state.position.y,
    );
    const distanceLabel = button.querySelector<HTMLElement>(
      ".chart-activity-distance",
    );
    if (distanceLabel) distanceLabel.textContent = formatChartDistance(distance);
  }
  const activity = selectedActivity();
  elements.chartCourseReadout.textContent = activity
    ? `Course: ${activity.title} · ${activity.objective}`
    : "No course selected";
}

function renderChart(): void {
  syncChartActivityList();
  chart.render(state, FAIR_WINDS_WORLD, weather.trueWind, selectedActivity());
}

function formatChartDistance(distance: number): string {
  return distance < 1_000
    ? `${Math.round(distance)} m`
    : `${(distance / 1_000).toFixed(1)} km`;
}

function isConditionsOpen(): boolean {
  return elements.conditionsPanel.classList.contains("is-open");
}

function isChartOpen(): boolean {
  return elements.chartPanel.classList.contains("is-open");
}

function isSimulationPaused(): boolean {
  return started && (
    developmentPreviewFrozen ||
    isConditionsOpen() ||
    isChartOpen()
  );
}

function setChartOpen(open: boolean, restoreFocus = true): void {
  if (open && isConditionsOpen()) setConditionsOpen(false, false);
  const pauseSimulation = open && started;
  elements.chartPanel.classList.toggle("is-open", open);
  elements.chartPanel.setAttribute("aria-hidden", String(!open));
  elements.mapToggle.setAttribute("aria-expanded", String(open));
  elements.chartBackdrop.hidden = !open;
  elements.gameShell.classList.toggle("is-chart-open", open);
  elements.gameShell.dataset.simulationPaused = String(
    started && (open || isConditionsOpen()),
  );
  if (pauseSimulation) {
    accumulator = 0;
    previousState = state;
  }
  if (open) {
    requestAnimationFrame(() => {
      renderChart();
      elements.chartClose.focus({ preventScroll: true });
    });
  } else if (restoreFocus && started) {
    elements.mapToggle.focus({ preventScroll: true });
  }
}

function setConditionsOpen(open: boolean, restoreFocus = true): void {
  if (open && isChartOpen()) setChartOpen(false, false);
  const pauseSimulation = open && started;
  elements.conditionsPanel.classList.toggle("is-open", open);
  elements.conditionsPanel.setAttribute("aria-hidden", String(!open));
  elements.conditionsToggle.setAttribute("aria-expanded", String(open));
  elements.conditionsBackdrop.hidden = !open;
  elements.gameShell.classList.toggle("is-settings-open", open);
  elements.gameShell.dataset.simulationPaused = String(
    started && (open || isChartOpen()),
  );
  elements.settingsResume.textContent = pauseSimulation ? "Resume sailing" : "Close settings";
  elements.settingsMainMenu.hidden = !started;
  if (pauseSimulation) {
    accumulator = 0;
    previousState = state;
  }
  if (open) {
    const activeTab = settingsTabs.tabs.find((tab) => tab.classList.contains("is-active"));
    activeTab?.focus({ preventScroll: true });
  }
  else if (restoreFocus && !started) elements.titleSettings.focus({ preventScroll: true });
  else if (restoreFocus) elements.conditionsToggle.focus({ preventScroll: true });
}


function bindWeatherControls(): void {
  const select = <T extends HTMLInputElement | HTMLSelectElement>(id: string) => required<T>(`#${id}`);
  select<HTMLSelectElement>("weather-preset").addEventListener("change", (event) => {
    const preset = WEATHER_PRESETS[(event.currentTarget as HTMLSelectElement).value];
    if (!preset) return;
    weatherConfig = cloneWeatherConfig(preset);
    applyWeatherConfig(true);
  });
  select<HTMLSelectElement>("sea-state").addEventListener(
    "change",
    (event) => {
      const id = (event.currentTarget as HTMLSelectElement).value;
      if (id === "wind-linked") {
        weatherConfig.waves.mode = "linked";
      } else {
        weatherConfig.waves.mode = "manual";
        const preset = SEA_STATE_PRESETS.find(
          (candidate) => candidate.id === id,
        );
        if (preset) {
          weatherConfig.waves.height = preset.height;
          weatherConfig.waves.length = preset.length;
          weatherConfig.waves.steepness = preset.steepness;
        }
      }
      applyWeatherConfig(true);
    },
  );
  const handlers: Array<[string, (value: string) => void]> = [
    ["weather-mode", (value) => { weatherConfig.mode = value === "evolving" ? "evolving" : "manual"; }],
    ["weather-seed", (value) => { weatherConfig.seed = clampNumber(value, 0, 999_999); }],
    ["wind-speed", (value) => { weatherConfig.wind.speed = clampNumber(value, 1, 14); }],
    ["wind-direction", (value) => { weatherConfig.wind.directionFromDegrees = clampNumber(value, 0, 359); }],
    ["gust", (value) => { weatherConfig.wind.gustStrength = clampNumber(value, 0, 0.5); }],
    ["wave-mode", (value) => { weatherConfig.waves.mode = value === "manual" ? "manual" : "linked"; }],
    ["wave-height", (value) => { weatherConfig.waves.height = clampNumber(value, 0.03, 4); }],
    ["wave-length", (value) => { weatherConfig.waves.length = clampNumber(value, 4, 90); }],
    ["wave-steepness", (value) => { weatherConfig.waves.steepness = clampNumber(value, 0.04, 0.62); }],
    ["tide-range", (value) => { weatherConfig.tide.range = clampNumber(value, 0, 3); }],
    ["tide-phase", (value) => { weatherConfig.tide.phaseHours = clampNumber(value, 0, 12.4); }],
    ["rain", (value) => { weatherConfig.rain = clampNumber(value, 0, 1); }],
    ["cloud", (value) => { weatherConfig.cloud = clampNumber(value, 0, 1); }],
    ["time-of-day", (value) => { weatherConfig.timeOfDay = clampNumber(value, 0, 23.9); }],
    ["time-scale", (value) => { weatherConfig.timeScale = clampNumber(value, 0, 4); }],
  ];
  for (const [id, assign] of handlers) {
    select(id).addEventListener("input", (event) => {
      assign((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
      applyWeatherConfig(false);
    });
  }
  required<HTMLButtonElement>("#restart-weather").addEventListener("click", () => {
    simulationTime = 0;
    weatherSystem.setConfig(weatherConfig);
    weather = weatherSystem.sample(0);
    audio.restartSeededEvents(weatherConfig.seed);
    elements.status.textContent = `Weather restarted with seed ${weatherConfig.seed}.`;
  });
  required<HTMLButtonElement>("#copy-weather").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(weatherConfig, null, 2));
      elements.status.textContent = "Weather configuration copied.";
    } catch {
      elements.status.textContent = "Could not copy weather configuration.";
    }
  });
}

function bindAudioControls(): void {
  if (elements.musicTrackSelect.options.length === 0) {
    for (const track of MUSIC_TRACKS) {
      const option = document.createElement("option");
      option.value = track.id;
      option.textContent = `${track.title} — ${track.setting}`;
      elements.musicTrackSelect.append(option);
    }
  }
  audio.setMusicStateListener(updateMusicPlayback);
  elements.musicPrevious.addEventListener("click", async () => {
    const playback = await audio.previousMusicTrack();
    elements.status.textContent = `Selected ${playback.track.title}.`;
  });
  elements.musicNext.addEventListener("click", async () => {
    const playback = await audio.nextMusicTrack();
    elements.status.textContent = `Selected ${playback.track.title}.`;
  });
  elements.musicToggle.addEventListener("click", async () => {
    const playback = await audio.toggleMusicPlayback();
    elements.status.textContent = playback.isPlaying
      ? `Playing ${playback.track.title}.`
      : "Music paused.";
  });
  elements.musicTrackSelect.addEventListener("change", async () => {
    const playback = await audio.selectMusicTrack(
      elements.musicTrackSelect.value,
    );
    elements.status.textContent = `Selected ${playback.track.title}.`;
  });

  const controls: Array<[string, AudioChannel]> = [
    ["master-volume", "master"],
    ["music-volume", "music"],
    ["ambience-volume", "ambience"],
    ["boat-volume", "boat"],
    ["weather-volume", "weather"],
  ];
  for (const [id, channel] of controls) {
    required<HTMLInputElement>(`#${id}`).addEventListener(
      "input",
      (event) => {
        const value =
          Number((event.currentTarget as HTMLInputElement).value) / 100;
        audio.setChannelVolume(channel, value);
        updateAudioVolumeOutput(id, value);
      },
    );
  }
}

function syncAudioControls(): void {
  const settings = audio.getSettings();
  const controls: Array<[string, AudioChannel]> = [
    ["master-volume", "master"],
    ["music-volume", "music"],
    ["ambience-volume", "ambience"],
    ["boat-volume", "boat"],
    ["weather-volume", "weather"],
  ];
  for (const [id, channel] of controls) {
    const value = settings.volumes[channel];
    required<HTMLInputElement>(`#${id}`).value = String(
      Math.round(value * 100),
    );
    updateAudioVolumeOutput(id, value);
  }
  syncMuteControl();
  updateMusicPlayback(audio.getMusicState());
}

function updateAudioVolumeOutput(id: string, value: number): void {
  required<HTMLOutputElement>(`#${id}-output`).value =
    `${Math.round(value * 100)}%`;
}

function updateMusicPlayback(playback: MusicPlaybackState): void {
  elements.musicTrackName.textContent = playback.track.title;
  elements.musicTrackSelect.value = playback.track.id;
  elements.musicPlaybackStatus.textContent = musicPlaybackStatus(
    playback.track,
    playback.isPlaying,
    playback.isReady,
    playback.isEnabled,
  );
  elements.musicToggle.textContent = playback.isPlaying ? "Pause" : "Play";
  elements.musicToggle.setAttribute(
    "aria-label",
    playback.isPlaying ? "Pause music" : "Play music",
  );
  elements.musicToggle.setAttribute(
    "aria-pressed",
    String(playback.isPlaying),
  );
}

function applyWeatherConfig(sync: boolean): void {
  weatherSystem.setConfig(weatherConfig);
  weather = weatherSystem.sample(simulationTime);
  audio.setSeed(weatherConfig.seed);
  localStorage.setItem("fair-winds-weather", JSON.stringify(weatherConfig));
  if (sync) syncWeatherControls();
  else updateWeatherOutputs();
}

function syncWeatherControls(): void {
  elements.boatSelect.value = activeBoat.id;
  setValue("weather-mode", weatherConfig.mode);
  setValue("weather-seed", weatherConfig.seed);
  setValue("wind-speed", weatherConfig.wind.speed);
  setValue("wind-direction", weatherConfig.wind.directionFromDegrees);
  setValue("gust", weatherConfig.wind.gustStrength);
  setValue("wave-mode", weatherConfig.waves.mode);
  setValue("sea-state", matchingSeaState());
  setValue("wave-height", weatherConfig.waves.height);
  setValue("wave-length", weatherConfig.waves.length);
  setValue("wave-steepness", weatherConfig.waves.steepness);
  setValue("tide-range", weatherConfig.tide.range);
  setValue("tide-phase", weatherConfig.tide.phaseHours);
  setValue("rain", weatherConfig.rain);
  setValue("cloud", weatherConfig.cloud);
  setValue("time-of-day", weatherConfig.timeOfDay);
  setValue("time-scale", weatherConfig.timeScale);
  updateWeatherOutputs();
}

function updateWeatherOutputs(): void {
  setValue("sea-state", matchingSeaState());
  required<HTMLOutputElement>("#wind-speed-output").value = `${weatherConfig.wind.speed.toFixed(1)} m/s`;
  required<HTMLOutputElement>("#wind-direction-output").value = `${Math.round(weatherConfig.wind.directionFromDegrees)}°`;
  required<HTMLOutputElement>("#gust-output").value = `${Math.round(weatherConfig.wind.gustStrength * 100)}%`;
  required<HTMLOutputElement>("#wave-height-output").value = weatherConfig.waves.mode === "linked" ? "Auto" : `${weatherConfig.waves.height.toFixed(2)} m`;
  required<HTMLOutputElement>("#wave-length-output").value = weatherConfig.waves.mode === "linked" ? "Auto" : `${Math.round(weatherConfig.waves.length)} m`;
  required<HTMLOutputElement>("#wave-steepness-output").value = weatherConfig.waves.mode === "linked" ? "Auto" : weatherConfig.waves.steepness.toFixed(2);
  required<HTMLOutputElement>("#tide-range-output").value = `${weatherConfig.tide.range.toFixed(1)} m`;
  required<HTMLOutputElement>("#tide-phase-output").value = `${weatherConfig.tide.phaseHours.toFixed(1)} h`;
  required<HTMLOutputElement>("#rain-output").value = `${Math.round(weatherConfig.rain * 100)}%`;
  required<HTMLOutputElement>("#cloud-output").value = `${Math.round(weatherConfig.cloud * 100)}%`;
  required<HTMLOutputElement>("#time-of-day-output").value = formatTimeOfDay(weatherConfig.timeOfDay);
  required<HTMLOutputElement>("#time-scale-output").value = `${weatherConfig.timeScale.toFixed(1)}×`;
  required<HTMLInputElement>("#wave-height").disabled = weatherConfig.waves.mode === "linked";
  required<HTMLInputElement>("#wave-length").disabled = weatherConfig.waves.mode === "linked";
  required<HTMLInputElement>("#wave-steepness").disabled = weatherConfig.waves.mode === "linked";
}

function matchingSeaState(): string {
  if (weatherConfig.waves.mode === "linked") return "wind-linked";
  const match = SEA_STATE_PRESETS.find(
    (preset) =>
      Math.abs(preset.height - weatherConfig.waves.height) < 0.015 &&
      Math.abs(preset.length - weatherConfig.waves.length) < 0.5 &&
      Math.abs(
        preset.steepness - weatherConfig.waves.steepness,
      ) < 0.015,
  );
  return match?.id ?? "custom";
}

function setValue(id: string, value: string | number): void {
  const element = required<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  element.value = String(value);
}

function loadWeatherConfig(): WeatherConfig {
  try {
    const stored = localStorage.getItem("fair-winds-weather");
    if (!stored) return cloneWeatherConfig(DEFAULT_WEATHER);
    const candidate = JSON.parse(stored) as Partial<WeatherConfig>;
    if (!candidate.wind || !candidate.waves || typeof candidate.seed !== "number") {
      return cloneWeatherConfig(DEFAULT_WEATHER);
    }
    return {
      ...cloneWeatherConfig(DEFAULT_WEATHER),
      ...candidate,
      wind: { ...DEFAULT_WEATHER.wind, ...candidate.wind },
      waves: { ...DEFAULT_WEATHER.waves, ...candidate.waves },
      tide: { ...DEFAULT_WEATHER.tide, ...candidate.tide },
    };
  } catch {
    return cloneWeatherConfig(DEFAULT_WEATHER);
  }
}

function loadBoatDefinition(): BoatDefinition {
  const stored = localStorage.getItem("fair-winds-boat");
  if (
    stored === "harbor-20" ||
    stored === "coastal-28" ||
    stored === "lake-34"
  ) {
    return getBoatDefinition(stored);
  }
  return HARBOR_20;
}

function clampNumber(value: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : minimum, minimum), maximum);
}

function formatTimeOfDay(value: number): string {
  const hours = Math.floor(value) % 24;
  const minutes = Math.round((value - Math.floor(value)) * 60) % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
