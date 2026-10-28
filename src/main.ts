import "./style.css";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
import {
  castOffRequested,
  dockingPoint,
  evaluateDocking,
  mooredBoatState,
  retainDockDeparture,
} from "./game/docking";
import {
  compassTicks,
  normalizeHeading,
  unwrapCompassHeading,
} from "./game/compass-tape";
import { SailingAcademy, LESSON_TITLES } from "./game/academy";
import { FIRST_BUOY, FIRST_BUOY_COURSE, FirstBuoyJourney } from "./game/first-buoy";
import { createLessonState, createLessonWeather, observeLesson, checkpointLesson, restoreLesson } from "./game/lesson-session";
import {
  ActivitySession,
  type ActivityView,
} from "./game/activity-session";
import { courseMetrics } from "./game/course-navigation";
import { LakeChart } from "./game/minimap";
import {
  PROGRESS_STORAGE_KEY,
  createProgress,
  parseProgress,
  recordActivityCompletion,
  recordAcademyObjective,
  recordFirstBuoyCompletion,
  nextLessonObjective,
  type SailingProgress,
} from "./game/progress";
import { timeScaleForHold } from "./game/time-scale";
import { sampleBoatWavePose } from "./game/wave-pose";
import {
  FAIR_WINDS_WORLD,
  type WorldActivity,
  type WorldObject,
} from "./game/world-definition";
import { depthAtTide } from "./game/bathymetry";
import { SailingWorld } from "./render/world";
import { classifyEncounter } from "./render/traffic-navigation";
import { bindTabList, trapFocusWithin, type TabListController } from "./ui/primitives";
import { loadBooleanPreference, saveBooleanPreference } from "./ui/preferences";
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
  advanceBoatWavePose,
  type BoatState,
  type Controls,
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
  destinationCourse: required("#destination-course"),
  heading: required("#heading-readout"),
  headingTape: required("#heading-tape"),
  headingCardinal: required("#heading-cardinal"),
  depthPanel: required("#depth-panel"),
  depth: required("#depth-readout"),
  depthState: required("#depth-state"),
  encounterPanel: required("#encounter-panel"),
  encounterAdvisory: required("#encounter-advisory"),
  status: required("#status"),
  statusToggle: required<HTMLButtonElement>("#status-toggle"),
  statusDetails: required("#status-details"),
  statusCue: required("#status-cue"),
  statusMessage: required("#status-message"),
  welcome: required("#welcome"),
  setSail: required<HTMLButtonElement>("#set-sail"),
  newJourney: required<HTMLButtonElement>("#new-journey"),
  titleSettings: required<HTMLButtonElement>("#title-settings"),
  titleMute: required<HTMLButtonElement>("#title-mute"),
  titleFreeSail: required<HTMLButtonElement>("#title-free-sail"),
  continueLesson: required<HTMLButtonElement>("#continue-lesson"),
  titleLogbook: required<HTMLButtonElement>("#title-logbook"),
  titleLogbookPanel: required("#title-logbook-panel"),
  lessonChooser: required("#lesson-chooser"),
  mute: required<HTMLButtonElement>("#mute"),
  reset: required<HTMLButtonElement>("#reset"),
  reefSail: required<HTMLButtonElement>("#reef-sail"),
  toggleSails: required<HTMLButtonElement>("#toggle-sails"),
  sailActions: required<HTMLDetailsElement>("#sail-actions"),
  conditionsToggle: required<HTMLButtonElement>("#conditions-toggle"),
  pauseToggle: required<HTMLButtonElement>("#pause-toggle"),
  pauseScreen: required("#pause-screen"),
  pausePanel: required("#pause-panel"),
  pauseMenu: required("#pause-menu"),
  pauseResume: required<HTMLButtonElement>("#pause-resume"),
  pauseSettings: required<HTMLButtonElement>("#pause-settings"),
  pauseLogbook: required<HTMLButtonElement>("#pause-logbook"),
  pauseLogbookView: required("#pause-logbook-view"),
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
  highContrastEnabled: required<HTMLInputElement>("#high-contrast-enabled"),
  settingsResetLogbook: required<HTMLButtonElement>("#settings-reset-logbook"),
  settingsLogbookSummary: required("#settings-logbook-summary"),
  logbookSummary: required("#logbook-summary"),
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

const STORAGE_WARNING = "Browser storage is unavailable. Progress may not survive reload.";
let storageUnavailable = false;
let activeBoat: BoatDefinition = loadBoatDefinition();
let world: SailingWorld;
let bootComplete = false;
try {
  const boatAsset = await new GLTFLoader().loadAsync("/models/fair-winds-boat-v2.glb");
  world = new SailingWorld(canvas, boatAsset.scene);
  world.setBoat(activeBoat);
} catch (error) {
  elements.fatal.hidden = false;
  elements.fatal.textContent = "Fair Winds could not load the lake and boat. Check your connection and reload; your browser also needs WebGL enabled.";
  finishBoot("failed");
  throw error;
}
const input = new GameInput(document, canControlBoat);
for (const button of [elements.reefSail, elements.toggleSails]) button.addEventListener("click", () => {
  elements.sailActions.open = false;
  elements.sailActions.querySelector("summary")?.focus();
});
elements.sailActions.addEventListener("keydown", event => {
  if (event.key === "Escape" && elements.sailActions.open) {
    event.preventDefault();
    event.stopPropagation();
    elements.sailActions.open = false;
    elements.sailActions.querySelector("summary")?.focus();
  }
});
document.addEventListener("pointerdown", event => {
  if (event.target instanceof Node && !elements.sailActions.contains(event.target)) elements.sailActions.open = false;
});
const chart = new LakeChart(elements.chartCanvas);
const miniChart = new LakeChart(elements.minimap);
const academy = new SailingAcademy();
let firstBuoy: FirstBuoyJourney | undefined;
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
let paused = false;
let pauseOpener: HTMLElement = elements.conditionsToggle;
let titleExitTimeout: number | undefined;
let lessonChooserOpener: HTMLButtonElement = elements.setSail;
let lastFlow = "";
let lastManeuverCount = 0;
let lessonCompletedAt = 0;
let incident: IncidentResult | undefined;
let incidentElapsed = 0;
let touchCooldown = 0;
let dockedAt: WorldObject | undefined;
let departingDock: WorldObject | undefined;
let dockedControls: Controls = { rudder: 0, sheetRate: 0 };
let progress: SailingProgress = parseProgress(
  loadStoredValue(PROGRESS_STORAGE_KEY),
);
let activitySession: ActivitySession | undefined;
let activityView: ActivityView | undefined;
let progressDistanceSinceSave = 0;
let voyageCounted = false;
restoreLesson(academy, progress);
let presentationTime = 0;
let hudUpdateElapsed = 0;
let compassHeading = radiansToDegrees(state.heading);
let compassPixelsPerDegree = 3.1;
let steeringHintOffered = loadBooleanPreference("fair-winds-swipe-hint-seen", false);
let steeringHintSeconds = 0;
canvas.addEventListener("pointerdown", () => { steeringHintSeconds = 0; });
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

buildCompassTape();
bindInterface();
syncTitleState();
world.resize();
syncWeatherControls();
syncAudioControls();
updateHud();
enableDevelopmentPreview();
registerServiceWorker();
requestAnimationFrame(loop);

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function registerServiceWorker(): void {
  const local =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";
  if (!("serviceWorker" in navigator) || local || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      elements.status.textContent =
        "Offline support is unavailable; online sailing is unaffected.";
    });
  });
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
    x: 1_020,
    z: -350,
    heading: degrees(150),
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
    timeOfDay: 14.7,
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
  elements.statusToggle.addEventListener("click", () => setStatusOpen(Boolean(elements.statusDetails.hidden)));
  required(".sailing-status").addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") event.stopPropagation();
  });
  required("#status-close").addEventListener("click", () => setStatusOpen(false));
  const lessonDetail = required<HTMLDetailsElement>(".lesson-detail");
  lessonDetail.addEventListener("toggle", () => {
    if (lessonDetail.open) lessonDetail.scrollIntoView({ block: "end", behavior: "smooth" });
  });
  window.addEventListener("pagehide", persistProgress);
  window.addEventListener("blur", interruptLessonAttempt);
  document.addEventListener("visibilitychange", interruptLessonAttempt);
  window.addEventListener("resize", () => {
    world.resize();
    buildCompassTape();
    if (isChartOpen()) renderChart();
  });
  window.addEventListener("keydown", (event) => {
    if (paused && !isConditionsOpen()) {
      if (event.code === "Escape" && !event.repeat) {
        event.preventDefault();
        if (!elements.pauseLogbookView.hidden) showPauseMenu(elements.pauseLogbook);
        else setPauseOpen(false);
      } else if (event.code === "Tab") trapFocusWithin(elements.pausePanel, event);
      return;
    }
    if (event.code === "Escape" && !elements.statusDetails.hidden) {
      event.preventDefault();
      setStatusOpen(false);
      return;
    }
    const titleDialog = !elements.lessonChooser.hidden ? elements.lessonChooser : !elements.titleLogbookPanel.hidden ? elements.titleLogbookPanel : undefined;
    if (!started && titleDialog) {
      if (event.code === "Escape") { event.preventDefault(); closeTitleDialog(); }
      else if (event.code === "Tab") trapFocusWithin(titleDialog, event);
      return;
    }
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
    if (event.code === "Escape" && !event.repeat && started) {
      event.preventDefault();
      setPauseOpen(true);
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
    openLessonChooser(elements.setSail);
  });
  elements.newJourney.addEventListener("click", () => {
    openLessonChooser(elements.newJourney);
  });
  elements.continueLesson.addEventListener("click", () => {
    if (progress.activeIntroduction === FIRST_BUOY.id) { startFirstBuoy(); return; }
    if (academy.view().objective === 3) { openLessonChooser(elements.continueLesson); return; }
    beginSailing(false);
    activitySession = undefined;
    activityView = undefined;
    academy.resume(state);
    prepareLessonAttempt();
  });
  elements.titleFreeSail.addEventListener("click", () => {
    firstBuoy = undefined;
    progress.activeIntroduction = undefined;
    beginSailing(false);
    activitySession = undefined;
    activityView = undefined;
    academy.skip();
    interruptLessonAttempt();
    weatherConfig = loadWeatherConfig();
    weatherSystem.setConfig(weatherConfig);
    weather = weatherSystem.sample(simulationTime);
    persistProgress();
    updateHud();
  });
  const lessonChoices = [...document.querySelectorAll<HTMLButtonElement>("[data-lesson]")];
  required("#start-first-buoy").addEventListener("click", startFirstBuoy);
  lessonChoices.forEach((button) => button.addEventListener("click", () => {
    lessonChoices.forEach((choice) => {
      choice.classList.toggle("is-selected", choice === button);
      choice.setAttribute("aria-pressed", String(choice === button));
    });
    syncLessonTargets();
  }));
  required("#start-lesson").addEventListener("click", () => {
    const lesson = Number(required<HTMLButtonElement>("[data-lesson].is-selected").dataset.lesson);
    closeTitleDialog(false);
    beginSailing(false);
    academy.restoreObjective(nextLessonObjective(progress, lesson));
    prepareLessonAttempt();
  });
  required("#lesson-chooser-close").addEventListener("click", () => closeTitleDialog());
  required("#title-logbook-close").addEventListener("click", () => closeTitleDialog());
  elements.titleLogbook.addEventListener("click", () => {
    fillLogbook(required("#title-logbook-stats"), required("#title-logbook-lessons"));
    elements.titleLogbookPanel.hidden = false;
    required(".welcome-lockup").hidden = true;
    required("#title-logbook-close").focus();
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
    if (firstBuoy) {
      if (firstBuoy.completed) { returnToTitle(); openLessonChooser(); }
      else prepareLessonAttempt("first-buoy");
      return;
    }
    if (activitySession) {
      setChartOpen(true);
    } else {
      if (academy.view().objective === 3 || academy.view().stage === "complete") {
        returnToTitle();
        openLessonChooser();
      } else if (academy.view().stage === "free-sail") {
        academy.resume(state);
        prepareLessonAttempt();
      } else {
        academy.skip();
        interruptLessonAttempt();
      }
      persistProgress();
      lessonCompletedAt = simulationTime;
      updateLesson();
    }
  });
  elements.mapToggle.addEventListener("click", () => setChartOpen(!isChartOpen()));
  elements.chartClose.addEventListener("click", () => setChartOpen(false));
  elements.chartBackdrop.addEventListener("click", () => setChartOpen(false));
  elements.conditionsToggle.addEventListener("click", () => setConditionsOpen(!isConditionsOpen()));
  elements.pauseToggle.addEventListener("click", () => setPauseOpen(true));
  elements.pauseResume.addEventListener("click", () => setPauseOpen(false));
  elements.pauseSettings.addEventListener("click", () => {
    elements.pauseScreen.hidden = true;
    setConditionsOpen(true);
  });
  elements.pauseLogbook.addEventListener("click", () => {
    fillLogbook(required("#pause-logbook-stats"), required("#pause-logbook-lessons"));
    elements.pauseMenu.hidden = true;
    elements.pauseLogbookView.hidden = false;
    required("#pause-heading").textContent = "Logbook";
    required("#pause-logbook-back").focus();
  });
  required("#pause-logbook-back").addEventListener("click", () => showPauseMenu(elements.pauseLogbook));
  required("#pause-main-menu").addEventListener("click", returnToTitle);
  elements.conditionsClose.addEventListener("click", () => setConditionsOpen(false));
  elements.conditionsBackdrop.addEventListener("click", () => setConditionsOpen(false));
  elements.settingsResume.addEventListener("click", () => setConditionsOpen(false));
  elements.settingsMainMenu.addEventListener("click", returnToTitle);
  elements.settingsResetBoat.addEventListener("click", resetBoat);
  elements.highContrastEnabled.checked = loadBooleanPreference(
    "fair-winds-high-contrast",
    false,
  );
  syncHighContrast();
  elements.highContrastEnabled.addEventListener("change", () => {
    syncHighContrast();
    if (!saveBooleanPreference(
      "fair-winds-high-contrast",
      elements.highContrastEnabled.checked,
    )) elements.status.textContent = "This setting applies for this session. Browser storage is unavailable.";
  });
  elements.settingsResetLogbook.addEventListener("click", () => {
    if (!window.confirm("Reset your local logbook? Saved activity records will be cleared.")) return;
    progress = createProgress();
    firstBuoy = undefined;
    activitySession = undefined;
    activityView = undefined;
    academy.reset({
      tackCount: state.tackCount,
      gybeCount: state.gybeCount,
    });
    persistProgress();
    syncChartActivityList();
    updateLesson();
    elements.status.textContent = "Local logbook reset. Academy coaching is ready.";
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
  elements.conditionsPanel.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "range") updateRangeFill(event.target);
  });
}

function titleMenuItems(): HTMLButtonElement[] {
  return [
    elements.continueLesson,
    elements.setSail,
    elements.newJourney,
    elements.titleFreeSail,
    elements.titleLogbook,
    elements.titleSettings,
  ].filter((item) => !item.hidden);
}

function syncTitleState(): void {
  setStatusOpen(false, false);
  const returning = progress.voyages > 0;
  const titleConfig = createTitleWeatherConfig();
  titleConfig.timeOfDay = returning ? 17.4 : 14.7;
  titleConfig.wind.directionFromDegrees = returning ? 65 : 147;
  titleWeatherSystem.setConfig(titleConfig);
  titleWeather = titleWeatherSystem.sample(presentationTime);
  titleState.position.x = returning ? 991 : 964;
  titleState.position.y = returning ? -236 : -404;
  titleState.heading = degrees(returning ? 130 : 105);
  titleState.boomAngle = degrees(returning ? 25 : -5);
  titleState.sheet = sheetForBoomAngle(titleState.boomAngle);
  refreshTitleDiagnostics();
  elements.welcome.dataset.returning = String(returning);
  required("#returning-copy").hidden = !returning;
  elements.setSail.hidden = returning;
  elements.continueLesson.hidden = !returning;
  const view = academy.view();
  const lesson = view.lesson;
  const choice = required(`[data-lesson="${lesson}"]`);
  const complete = view.objective === 3 || view.stage === "complete";
  elements.newJourney.hidden = !returning || complete;
  required("#returning-lesson").textContent = LESSON_TITLES[lesson]!;
  required("#returning-target").textContent = complete
    ? `${progress.academyCompleted ? "Academy" : "Lesson"} complete · All ${progress.academyCompleted ? "nine" : "three"} targets earned`
    : `Target ${view.objective + 1} of 3 · ${choice.querySelector(".lesson-targets")!.textContent!.split("·")[view.objective]!.trim()}`;
  elements.continueLesson.firstChild!.textContent = complete ? "Choose lesson" : "Continue lesson";
  if (progress.activeIntroduction === FIRST_BUOY.id) {
    const earned = progress.completedIntroductions?.[FIRST_BUOY.id] === FIRST_BUOY.revision;
    required("#returning-lesson").textContent = FIRST_BUOY.title;
    required("#returning-target").textContent = earned ? "Journey complete · Reach Juniper buoy again" : "Fresh departure · Sail to Juniper buoy";
    elements.continueLesson.firstChild!.textContent = earned ? "Repeat journey" : "Continue journey";
    elements.newJourney.hidden = !returning;
  }
  selectTitleItem(returning ? elements.continueLesson : elements.setSail);
}

function setStatusOpen(open: boolean, restoreFocus = true): void {
  if (open) input.releaseAll();
  elements.statusMessage.textContent = elements.status.textContent;
  elements.statusDetails.hidden = !open;
  elements.statusToggle.setAttribute("aria-expanded", String(open));
  if (!open && restoreFocus) elements.statusToggle.focus();
}

function syncLessonTargets(): void {
  const targets = required("[data-lesson].is-selected .lesson-targets").textContent!.split("·");
  const list = required("#chosen-lesson-targets");
  list.replaceChildren(...targets.map((target) => {
    const row = document.createElement("li");
    row.textContent = target.trim();
    return row;
  }));
}

function openLessonChooser(opener: HTMLButtonElement = elements.continueLesson): void {
  lessonChooserOpener = opener;
  void startTitleAudio();
  elements.lessonChooser.hidden = false;
  required(".welcome-lockup").hidden = true;
  syncLessonTargets();
  required("[data-lesson].is-selected").focus();
}

function closeTitleDialog(restoreFocus = true): void {
  const logbook = !elements.titleLogbookPanel.hidden;
  elements.lessonChooser.hidden = true;
  elements.titleLogbookPanel.hidden = true;
  required(".welcome-lockup").hidden = false;
  if (restoreFocus) (logbook ? elements.titleLogbook : lessonChooserOpener).focus();
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
  const firstStart = !audio.isStarted;
  titleAudioPromise = (async () => {
    try {
      await audio.start();
      if (firstStart) await audio.selectMusicTrack("fair-winds");
      syncAudioControls();
    } catch {
      elements.status.textContent =
        "Audio is unavailable; sailing will continue silently.";
    } finally {
      titleAudioPromise = undefined;
    }
  })();
  return titleAudioPromise;
}

function beginSailing(newJourney: boolean): void {
  void startTitleAudio();
  if (newJourney || !voyageCounted) {
    progress = { ...progress, voyages: progress.voyages + 1 };
    persistProgress();
    voyageCounted = true;
  }
  if (newJourney) {
    resetJourney();
  }
  started = true;
  world.resetCamera();
  elements.gameShell.classList.remove("is-welcome");
  elements.welcome.classList.add("is-leaving");
  window.clearTimeout(titleExitTimeout);
  titleExitTimeout = window.setTimeout(() => {
    elements.welcome.hidden = true;
  }, 540);
  hudUpdateElapsed = 0;
  updateHud();
  elements.status.textContent = dockedAt
    ? `Docked at ${dockedAt.name}. Use the helm or sheets to cast off.`
    : !state.sailsRaised
      ? "Sails lowered. Hoist sail to make way."
      : newJourney
        ? "New journey. Sheet in gently until the mainsail stops luffing."
        : `${elements.flow.textContent}. ${elements.coach.textContent}.`;
}

function returnToTitle(): void {
  setPauseOpen(false, false);
  interruptLessonAttempt();
  persistProgress();
  window.clearTimeout(titleExitTimeout);
  setConditionsOpen(false);
  setChartOpen(false);
  started = false;
  elements.welcome.hidden = false;
  elements.welcome.classList.remove("is-leaving");
  elements.gameShell.classList.add("is-welcome");
  syncTitleState();
  elements.continueLesson.focus({ preventScroll: true });
  audio.resetMotionState();
  elements.status.textContent = "Main menu. Your journey is ready to continue.";
}

function syncHighContrast(): void {
  elements.gameShell.classList.toggle(
    "is-high-contrast",
    elements.highContrastEnabled.checked,
  );
}

function resetJourney(): void {
  firstBuoy = undefined;
  progress.activeIntroduction = undefined;
  simulationTime = 0;
  weatherConfig = cloneWeatherConfig(DEFAULT_WEATHER);
  activeBoat = HARBOR_20;
  saveStoredValue("fair-winds-boat", activeBoat.id);
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
  academy.reset({
    tackCount: state.tackCount,
    gybeCount: state.gybeCount,
  });
  lessonCompletedAt = 0;
  activitySession = undefined;
  activityView = undefined;
  lastManeuverCount = 0;
  clearDocking();
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
    previewBoat === "cove-24" ||
    previewBoat === "coastal-28" ||
    previewBoat === "sound-30" ||
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
  if (preview === "game" && parameters.get("landmark") === "juniper-harbor") {
    selectedActivityId = "juniper-arrival";
    state = {
      ...state,
      position: { x: 980, y: -420 },
      heading: degrees(136),
      velocity: { x: 0, y: 0 },
    };
    if (parameters.get("docked") === "1") {
      const dock = FAIR_WINDS_WORLD.objects.find(
        (object) => object.id === "juniper-cove-dock",
      );
      if (dock?.docking) {
        state = mooredBoatState(state, {
          object: dock,
          point: dockingPoint(dock),
          heading: dock.docking.heading,
          speed: 0,
        });
        dockedAt = dock;
        elements.gameShell.dataset.dockedAt = dock.id;
      }
    }
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
  const elapsed = Math.max((now - previousFrame) / 1_000, 0);
  const droppedFrame = elapsed > fixedStep * 5;
  const frameDt = Math.min(elapsed, 0.1);
  previousFrame = now;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  elements.gameShell.inert = portrait;
  if (portrait || document.hidden) interruptLessonAttempt();
  if (droppedFrame) {
    academy.interrupt();
    firstBuoy?.interrupt();
    accumulator = 0;
  }
  if (!portrait) presentationTime += frameDt;
  if (input.consumeMute()) toggleMute();
  if (input.consumeConditions()) setConditionsOpen(!isConditionsOpen());
  const simulationPaused = document.hidden || portrait || isSimulationPaused();
  if (simulationPaused) { academy.interrupt(); firstBuoy?.interrupt(); input.releaseAll(); }
  if (canControlBoat() && !steeringHintOffered && window.matchMedia("(pointer: coarse)").matches) {
    steeringHintOffered = true;
    steeringHintSeconds = 5;
    saveBooleanPreference("fair-winds-swipe-hint-seen", true);
  }
  if (!simulationPaused) steeringHintSeconds = Math.max(0, steeringHintSeconds - frameDt);
  required("#steering-hint").hidden = steeringHintSeconds <= 0 || !canControlBoat();
  const simulationTimeScale = firstBuoy ? 1 : timeScaleForHold(input.isFastForwarding());
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
        if (incident.kind === "grounding") {
          state = {
            ...state,
            ...advanceBoatWavePose(state, sampleBoatWavePose(state, weather.waves, weather.time, activeBoat), activeBoat, fixedStep),
          };
        }
      } else {
        const controls = isConditionsOpen()
          ? { rudder: 0, sheetRate: 0 }
          : input.read(state.sheet);
        if (dockedAt) {
          const castingOff = castOffRequested(controls, dockedControls);
          dockedControls = controls;
          if (!castingOff) {
            state = {
              ...state,
              velocity: { x: 0, y: 0 },
              yawRate: 0,
              rudderAngle: 0,
            };
            diagnostics = computeSailAerodynamics(state, {
              trueWind: weather.trueWind,
              boat: activeBoat,
            });
            headsailDiagnostics = computeHeadsailAerodynamics(state, {
              trueWind: weather.trueWind,
              boat: activeBoat,
            });
            accumulator -= fixedStep;
            continue;
          }
          const departure = dockedAt;
          clearDocking();
          departingDock = departure;
          elements.status.textContent =
            "Casting off from Juniper Harbor. Steer clear of the finger pier.";
        }
        const wavePose = sampleBoatWavePose(
          state,
          weather.waves,
          weather.time,
          activeBoat,
        );
        const result = stepBoat(
          state,
          controls,
          {
            trueWind: weather.trueWind,
            wavePose,
            boat: activeBoat,
          },
          fixedStep,
        );
        departingDock = retainDockDeparture(result.state, departingDock);
        const nextIncident = evaluateIncident(
          result.state,
          activeBoat,
          FAIR_WINDS_WORLD,
          weather.tideLevel,
          departingDock,
          state,
        );
        if (nextIncident.kind === "docking") {
          const docking = evaluateDocking(
            result.state,
            activeBoat,
            FAIR_WINDS_WORLD,
            departingDock,
          );
          if (docking) {
            state = mooredBoatState(result.state, docking);
            dockedAt = docking.object;
            departingDock = undefined;
            dockedControls = controls;
            elements.gameShell.dataset.dockedAt = docking.object.id;
            elements.status.textContent =
              "Docked at Juniper Harbor. Use the helm or sheets when you are ready to cast off.";
          } else {
            state = result.state;
          }
        } else if (nextIncident.severity === "touch") {
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
            ...nextIncident.contactPose,
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
        const sailedDistance = Math.hypot(
          state.position.x - previousState.position.x,
          state.position.y - previousState.position.y,
        );
        if (sailedDistance > 0 && sailedDistance < 12) {
          progress = {
            ...progress,
            distanceSailed: progress.distanceSailed + sailedDistance,
          };
          progressDistanceSinceSave += sailedDistance;
          if (progressDistanceSinceSave >= 50) {
            progressDistanceSinceSave = 0;
            persistProgress();
          }
        }
        const eligible = !droppedFrame && !incident && nextIncident.kind !== "docking"
          && nextIncident.severity !== "touch" && !activitySession && !dockedAt;
        if (firstBuoy) {
          const unsafe = Boolean(incident) || nextIncident.severity === "touch" || nextIncident.severity === "impact"
            || nextIncident.severity === "stranded" || nextIncident.kind === "docking" || Boolean(dockedAt);
          if (droppedFrame && !unsafe) firstBuoy.interrupt();
          else if (firstBuoy.update(fixedStep, { ...observeLesson(state, diagnostics, controls),
            position: state.position, heading: state.heading, unsafe })) {
            progress = recordFirstBuoyCompletion(progress);
            persistProgress();
            elements.status.textContent = "Juniper buoy reached under control. Journey complete.";
          }
        }
        if (!eligible || firstBuoy) academy.interrupt();
        else {
          const earnedObjective = academy.objectiveIndex();
          if (academy.update(fixedStep / simulationTimeScale, observeLesson(state, diagnostics, controls))) {
            progress = recordAcademyObjective(progress, earnedObjective);
            persistProgress();
            const view = academy.view();
            elements.status.textContent = view.stage === "lesson-complete"
              ? `${view.title} complete. All three targets earned.`
              : `${view.title}. ${view.instruction}`;
            if (view.stage === "lesson-complete") lessonCompletedAt = simulationTime;
          }
        }
        updateActivitySession(fixedStep);
      }
    }
    accumulator = Math.max(0, accumulator - fixedStep);
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
    simulationPaused ? 0 : frameDt,
    incident ? { result: incident, elapsed: incidentElapsed } : undefined,
    started ? undefined : progress.voyages > 0 ? "return" : "arrival",
    presentationTime,
  );
  if (started) updateCompass(renderCurrent.heading);
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

function finishBoot(status: "ready" | "failed" = "ready"): void {
  if (bootComplete) return;
  bootComplete = true;
  document.documentElement.dataset.appReady = String(status === "ready");
  window.setTimeout(() => {
    document.querySelector("#boot-loader")?.remove();
  }, 260);
}

function resetBoat(): void {
  interruptLessonAttempt();
  if (firstBuoy) { prepareLessonAttempt("first-buoy"); return; }
  if (started && !activitySession && !["free-sail", "lesson-complete", "complete"].includes(academy.view().stage)) {
    prepareLessonAttempt();
    return;
  }
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
  activitySession = undefined;
  activityView = undefined;
  audio.resetMotionState();
  lessonCompletedAt = 0;
  lastManeuverCount = 0;
  clearDocking();
  clearIncident();
  world.resetWake();
  world.resetCamera();
  elements.status.textContent = "Boat reset. Sheet in gently to attach flow.";
}

function selectBoat(id: BoatId): void {
  const nextBoat = getBoatDefinition(id);
  if (!nextBoat) return;
  const leftIntroduction = Boolean(firstBuoy);
  if (leftIntroduction) {
    firstBuoy = undefined;
    progress.activeIntroduction = undefined;
    persistProgress();
  }
  activeBoat = nextBoat;
  saveStoredValue("fair-winds-boat", activeBoat.id);
  world.setBoat(activeBoat);
  refreshTitleDiagnostics();
  resetBoat();
  elements.boatSelect.value = activeBoat.id;
  elements.status.textContent =
    `${activeBoat.name} selected. Draft ${activeBoat.hull.draft.toFixed(2)} m.${leftIntroduction ? " Free sailing; choose the first journey to try again." : ""}`;
}

function recoverBoat(): void {
  if (firstBuoy) { prepareLessonAttempt("first-buoy"); return; }
  interruptLessonAttempt();
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
  academy.skip();
  persistProgress();
  audio.resetMotionState();
  lessonCompletedAt = simulationTime;
  lastManeuverCount = 0;
  clearDocking();
  clearIncident();
  world.resetWake();
  elements.status.textContent =
    "Recovered in deep water near the sailing school.";
}

function beginIncident(result: IncidentResult): void {
  interruptLessonAttempt();
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

function clearDocking(): void {
  dockedAt = undefined;
  departingDock = undefined;
  dockedControls = { rudder: 0, sheetRate: 0 };
  delete elements.gameShell.dataset.dockedAt;
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
  elements.statusCue.textContent = `${flow}. ${coach}. ${elements.motion.textContent}`;
  elements.marker.style.top = `${state.sheet * 100}%`;
  required(".trim-track").style.setProperty("--sheet-position", `${state.sheet * 100}%`);
  required<HTMLInputElement>("#hud-sheet").value = String(state.sheet);
  required<HTMLInputElement>("#hud-sheet").setAttribute("aria-valuetext", `${elements.sailPlanLabel.textContent} · ${Math.round(state.sheet * 100)}% eased`);
  required<HTMLOutputElement>("#trim-value").value = `${Math.round(state.sheet * 100)}%`;
  elements.target.style.top = `${sheetForBoomAngle(diagnostics.idealBoomAngle) * 100}%`;
  elements.boom.textContent = `Boom ${boomDegrees}° ${boomSide}`;
  syncSailControls();
  updateLesson();
  updateDestination();
  updateNavigation();
  miniChart.render(state, FAIR_WINDS_WORLD, weather.trueWind, activeCourse());
  const completedManeuver =
    state.maneuverCount !== lastManeuverCount && state.lastManeuver !== "none";
  if (completedManeuver) {
    elements.status.textContent = state.lastManeuver === "gybe"
      ? "Gybe complete. The boom crossed with the wind astern; steady the helm and retrim."
      : "Tack complete. Build speed on the new side and retrim.";
    lastManeuverCount = state.maneuverCount;
    lastFlow = flow;
  } else if (flow !== lastFlow && started && !dockedAt) {
    elements.status.textContent = `${flow}. ${coach}.`;
    lastFlow = flow;
  }
  if (storageUnavailable && !elements.status.textContent?.includes(STORAGE_WARNING)) {
    elements.status.textContent += ` ${STORAGE_WARNING}`;
  }
  elements.statusMessage.textContent = elements.status.textContent;
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
  const heading = Math.round(normalizeHeading(radiansToDegrees(state.heading))) % 360;
  const depth = depthAtTide(FAIR_WINDS_WORLD.sampleDepth(
    state.position.x,
    state.position.y,
  ), weather.tideLevel);
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
  const playerTrafficPose = {
    x: state.position.x,
    z: state.position.y,
    heading: state.heading,
    speed: Math.hypot(state.velocity.x, state.velocity.y),
  };
  const advisories = world
    .trafficSnapshot()
    .map((traffic) => classifyEncounter(playerTrafficPose, traffic))
    .filter((advisory) => advisory.type !== "clear")
    .sort((a, b) => a.distance - b.distance);
  const encounter = advisories[0];
  elements.encounterPanel.dataset.role = encounter?.role ?? "clear";
  elements.encounterAdvisory.textContent = encounter
    ? `${encounter.advice} · ${Math.round(encounter.distance)} m`
    : "Clear";
}

function buildCompassTape(): void {
  compassPixelsPerDegree = window.innerHeight <= 600 ? 1.25 : 3.1;
  const fragment = document.createDocumentFragment();
  for (const tick of compassTicks()) {
    const marker = document.createElement("span");
    marker.className = `heading-tick is-${tick.kind}`;
    marker.style.setProperty(
      "--tick-offset",
      `${tick.degrees * compassPixelsPerDegree}px`,
    );
    if (tick.label) {
      if (tick.label.length > 1) marker.dataset.intercardinal = "true";
      const label = document.createElement("span");
      label.className = "heading-tick-label";
      label.textContent = tick.label;
      marker.append(label);
    }
    fragment.append(marker);
  }
  elements.headingTape.replaceChildren(fragment);
  updateCompass(state.heading);
}

function updateCompass(headingRadians: number): void {
  compassHeading = unwrapCompassHeading(
    compassHeading,
    radiansToDegrees(headingRadians),
  );
  elements.headingTape.style.transform =
    `translate3d(${-compassHeading * compassPixelsPerDegree}px, 0, 0)`;

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
  if (firstBuoy) {
    const view = firstBuoy.view(state.position);
    const course = courseMetrics(state.position, state.velocity, state.heading, FIRST_BUOY_COURSE);
    const approach = `Juniper buoy · ${formatChartDistance(course.distance)} · ${Math.round(course.bearingDegrees).toString().padStart(3, "0")}°`;
    elements.gameShell.classList.add("is-learning");
    elements.gameShell.dataset.academyStage = firstBuoy.completed ? "intro-complete" : "intro-buoy-1";
    delete elements.gameShell.dataset.activeActivity;
    delete elements.gameShell.dataset.activityProgress;
    delete elements.gameShell.dataset.activityScore;
    required("#status-lesson-progress").hidden = false;
    required("#status-lesson-progress").textContent = firstBuoy.completed ? "First journey complete" : approach;
    required("#status-pips").hidden = true;
    elements.lessonCard.hidden = false;
    elements.lessonCard.classList.remove("is-minimized");
    elements.lessonCard.classList.toggle("is-complete", firstBuoy.completed);
    elements.lessonEyebrow.textContent = firstBuoy.completed ? "Journey complete" : "First journey";
    elements.lessonTitle.textContent = FIRST_BUOY.title;
    elements.lessonInstruction.textContent = view.instruction;
    required("#status-objective-detail").hidden = false;
    required("#status-objective-detail").textContent = firstBuoy.completed ? view.instruction : `${view.instruction} ${approach}.`;
    elements.lessonProgress.style.width = `${view.progress * 100}%`;
    elements.lessonSkip.textContent = firstBuoy.completed ? "Choose lesson" : "Retry journey";
    elements.lessonSkip.disabled = false;
    return;
  }
  const lessonView = academy.view();
  const learning = !activitySession && !["free-sail", "complete"].includes(lessonView.stage);
  required("#status-lesson-progress").hidden = !learning;
  required("#status-pips").hidden = !learning;
  required("#status-lesson-progress").textContent = `Lesson ${lessonView.lesson + 1} · ${lessonView.objective}/3 complete`;
  elements.gameShell.classList.toggle("is-learning", learning);
  for (const [index, pip] of [...required("#status-pips").children].entries()) {
    pip.classList.toggle("is-earned", index < lessonView.objective);
    pip.classList.toggle("is-current", index === lessonView.objective && lessonView.stage !== "lesson-complete");
  }
  if (activitySession && activityView) {
    const activity = activitySession.activity;
    const score = activityView.score;
    elements.gameShell.dataset.activeActivity = activity.id;
    elements.gameShell.dataset.activityProgress =
      activityView.progress.toFixed(3);
    if (score) {
      elements.gameShell.dataset.activityScore = String(score.total);
    } else {
      delete elements.gameShell.dataset.activityScore;
    }
    elements.lessonEyebrow.textContent = score
      ? `${activity.kind} complete · ${score.total}/100`
      : `${activity.kind} · ${Math.round(activityView.progress * 100)}%`;
    elements.lessonTitle.textContent = score
      ? `${activity.title} complete`
      : activity.title;
    elements.lessonInstruction.textContent = score
      ? `Control ${score.control} · Trim ${score.trim} · Safety ${score.safety} · Efficiency ${score.efficiency}`
      : activityView.instruction;
    required("#status-objective-detail").hidden = false;
    required("#status-objective-detail").textContent = elements.lessonInstruction.textContent;
    elements.lessonProgress.style.width =
      `${Math.min(activityView.progress, 1) * 100}%`;
    elements.lessonSkip.textContent = "Choose next";
    elements.lessonSkip.disabled = false;
    elements.lessonCard.classList.toggle(
      "is-complete",
      activityView.completed,
    );
    elements.lessonCard.classList.remove("is-minimized");
    elements.lessonCard.hidden = activityView.completed;
    return;
  }
  const view = academy.view();
  if (view.stage === "free-sail" && (elements.gameShell.dataset.academyStage !== "free-sail" || elements.gameShell.dataset.activeActivity)) {
    elements.status.textContent = `${elements.flow.textContent}. ${elements.coach.textContent}.`;
  }
  elements.lessonCard.hidden = view.stage === "free-sail" || view.stage === "complete";
  delete elements.gameShell.dataset.activeActivity;
  delete elements.gameShell.dataset.activityProgress;
  delete elements.gameShell.dataset.activityScore;
  elements.gameShell.dataset.academyStage = view.stage;
  elements.lessonEyebrow.textContent = view.eyebrow;
  elements.lessonTitle.textContent = view.stage === "free-sail" ? "Free sail" : view.title;
  elements.lessonInstruction.textContent = view.feedback || view.instruction;
  required("#status-objective-detail").hidden = elements.lessonCard.hidden;
  required("#status-objective-detail").textContent = elements.lessonCard.hidden ? "" : view.feedback || view.instruction;
  elements.lessonProgress.style.width = `${Math.min(view.progress, 1) * 100}%`;
  const complete = view.stage === "complete" || view.stage === "lesson-complete";
  elements.lessonSkip.textContent = complete ? "Choose lesson" : view.stage === "free-sail" ? "Resume lessons" : "Free sail";
  elements.lessonSkip.disabled = false;
  elements.lessonCard.classList.toggle("is-complete", complete);
  const shouldMinimize = complete && simulationTime - lessonCompletedAt > 7;
  elements.lessonCard.classList.toggle("is-minimized", shouldMinimize);
}

function interruptLessonAttempt(): void {
  input.releaseAll();
  elements.sailActions.open = false;
  academy.interrupt();
  firstBuoy?.interrupt();
  accumulator = 0;
  previousFrame = performance.now();
}

function startFirstBuoy(): void {
  closeTitleDialog(false);
  beginSailing(false);
  academy.skip();
  prepareLessonAttempt("first-buoy");
}

function prepareLessonAttempt(kind: "drill" | "first-buoy" = "drill"): void {
  interruptLessonAttempt();
  firstBuoy = kind === "first-buoy" ? new FirstBuoyJourney() : undefined;
  progress.activeIntroduction = firstBuoy ? FIRST_BUOY.id : undefined;
  activeBoat = HARBOR_20;
  world.setBoat(activeBoat);
  weatherConfig = createLessonWeather();
  if (firstBuoy) weatherConfig.seed = FIRST_BUOY.seed;
  weatherSystem.setConfig(weatherConfig);
  simulationTime = 0;
  weather = weatherSystem.sample(0);
  state = createLessonState(Math.min(academy.objectiveIndex(), 8), weather.trueWind);
  if (firstBuoy) {
    state = createLessonState(0, weather.trueWind, FIRST_BUOY.start);
    state.heading = degrees(FIRST_BUOY.startHeadingDegrees);
  }
  previousState = state;
  diagnostics = computeSailAerodynamics(state, { trueWind: weather.trueWind, boat: activeBoat });
  headsailDiagnostics = computeHeadsailAerodynamics(state, { trueWind: weather.trueWind, boat: activeBoat });
  clearIncident();
  clearDocking();
  activitySession = undefined;
  activityView = undefined;
  lastManeuverCount = 0;
  audio.resetMotionState();
  world.resetWake();
  world.resetCamera();
  academy.update(fixedStep, observeLesson(state, diagnostics, { rudder: 0, sheetRate: 0 }));
  syncWeatherControls();
  persistProgress();
  updateHud();
}

function updateActivitySession(dt: number): void {
  if (!activitySession) return;
  const previousCompleted = activityView?.completed ?? false;
  activityView = activitySession.update({
    dt,
    x: state.position.x,
    z: state.position.y,
    speed: Math.hypot(state.velocity.x, state.velocity.y),
    heading: state.heading,
    attached: diagnostics.attached,
    tackCount: state.tackCount,
    reefed: state.reefLevel === 1,
    heelRadians: state.heel,
    depth:
      depthAtTide(FAIR_WINDS_WORLD.sampleDepth(state.position.x, state.position.y), weather.tideLevel),
    dockedAt: dockedAt?.id,
    incident: Boolean(incident),
  });
  if (!previousCompleted && activityView.completed && activityView.score) {
    progress = recordActivityCompletion(
      progress,
      activitySession.activity.id,
      activityView.score,
    );
    persistProgress();
    syncChartActivityList();
    lessonCompletedAt = simulationTime;
    elements.status.textContent =
      `${activitySession.activity.title} complete. Score ${activityView.score.total} of 100.`;
  }
}

function persistProgress(): void {
  progress = checkpointLesson(progress, academy);
  saveStoredValue(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

function updateDestination(): void {
  const course = activeCourse();
  required(".destination").hidden = !course;
  if (course) {
    const metrics = courseMetrics(
      state.position,
      state.velocity,
      state.heading,
      course,
    );
    elements.destinationName.textContent = course.title;
    elements.destinationDistance.textContent = formatChartDistance(
      metrics.distance,
    );
    const bearing = Math.round(metrics.bearingDegrees)
      .toString()
      .padStart(3, "0");
    const turn =
      Math.abs(metrics.courseErrorDegrees) < 4
        ? "On course"
        : `${Math.abs(Math.round(metrics.courseErrorDegrees))}° ${metrics.courseErrorDegrees > 0 ? "starboard" : "port"}`;
    elements.destinationCourse.textContent =
      `${bearing}° · VMG ${(metrics.vmg * 1.94384).toFixed(1)} kn · ${turn}`;
    return;
  }

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
    const score = document.createElement("span");
    score.className = "chart-activity-score";
    copy.append(score);
    button.append(marker, copy, distance);
    button.addEventListener("click", () => selectChartActivity(activity.id));
    elements.chartActivityList.append(button);
  });
  syncChartActivityList();
}

function activeCourse(): WorldActivity | undefined {
  if (firstBuoy) return firstBuoy.completed ? undefined : FIRST_BUOY_COURSE;
  return activityView?.completed ? undefined : activitySession?.activity;
}

function selectedActivity(): WorldActivity | undefined {
  return FAIR_WINDS_WORLD.activities.find(
    (activity) => activity.id === selectedActivityId,
  );
}

function selectChartActivity(id: string): void {
  interruptLessonAttempt();
  firstBuoy = undefined;
  progress.activeIntroduction = undefined;
  persistProgress();
  selectedActivityId = id;
  const activity = selectedActivity();
  if (activity) {
    activitySession = new ActivitySession(activity);
    activityView = undefined;
    updateActivitySession(0);
  }
  syncChartActivityList();
  renderChart();
  updateDestination();
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
    const record = progress.activities[activity.id];
    button.classList.toggle("is-selected", selected);
    button.classList.toggle("is-complete", Boolean(record));
    button.setAttribute("aria-pressed", String(selected));
    const distance = Math.hypot(
      activity.x - state.position.x,
      activity.z - state.position.y,
    );
    const distanceLabel = button.querySelector<HTMLElement>(
      ".chart-activity-distance",
    );
    if (distanceLabel) distanceLabel.textContent = formatChartDistance(distance);
    const scoreLabel = button.querySelector<HTMLElement>(
      ".chart-activity-score",
    );
    if (scoreLabel) {
      scoreLabel.textContent = record
        ? `Best ${record.bestScore} · ${record.completions} ${record.completions === 1 ? "completion" : "completions"}`
        : "Not yet completed";
    }
  }
  const completed = Object.keys(progress.activities).length;
  elements.logbookSummary.textContent =
    `${completed} of ${FAIR_WINDS_WORLD.activities.length} activities complete · ${progress.voyages} ${progress.voyages === 1 ? "voyage" : "voyages"} · ${formatChartDistance(progress.distanceSailed)} sailed.`;
  elements.settingsLogbookSummary.textContent =
    completed === 0
      ? `${formatChartDistance(progress.distanceSailed)} sailed · no completed activities yet`
      : `${completed} activities · ${progress.voyages} voyages · ${formatChartDistance(progress.distanceSailed)}`;
  const activity = firstBuoy ? activeCourse() : selectedActivity();
  elements.chartCourseReadout.textContent = activity
    ? `Course: ${activity.title} · ${activity.objective}`
    : "No course selected";
}

function renderChart(): void {
  syncChartActivityList();
  chart.render(state, FAIR_WINDS_WORLD, weather.trueWind, firstBuoy ? activeCourse() : selectedActivity());
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

function canControlBoat(): boolean {
  return bootComplete && started && !incident && !document.hidden && !window.matchMedia("(orientation: portrait)").matches && !isSimulationPaused() && Boolean(elements.statusDetails.hidden);
}

function isSimulationPaused(): boolean {
  return started && (
    paused ||
    developmentPreviewFrozen ||
    isConditionsOpen() ||
    isChartOpen()
  );
}

function fillLogbook(stats: HTMLElement, list: HTMLElement): void {
  stats.textContent = `${progress.voyages} voyages · ${formatChartDistance(progress.distanceSailed)} sailed`;
  if (storageUnavailable) stats.textContent += ` ${STORAGE_WARNING}`;
  list.replaceChildren();
  const introduction = document.createElement("li");
  introduction.textContent = `${FIRST_BUOY.title} · ${progress.completedIntroductions?.[FIRST_BUOY.id] === FIRST_BUOY.revision ? "Complete" : "Not yet completed"}`;
  list.append(introduction);
  document.querySelectorAll<HTMLButtonElement>("[data-lesson]").forEach((choice, index) => {
    const row = document.createElement("li");
    row.textContent = `${choice.querySelector(".lesson-name")!.textContent!.trim()} · ${progress.academyCompleted || progress.completedLessons?.includes(index) ? "Complete" : "Not yet completed"}`;
    list.append(row);
  });
}

function showPauseMenu(focus: HTMLElement = elements.pauseResume): void {
  elements.pauseScreen.hidden = false;
  elements.pauseMenu.hidden = false;
  elements.pauseLogbookView.hidden = true;
  required("#pause-heading").textContent = "Paused";
  focus.focus({ preventScroll: true });
}

function setPauseOpen(open: boolean, restoreFocus = true): void {
  if (open && !started) return;
  if (open) {
    pauseOpener = document.activeElement instanceof HTMLElement ? document.activeElement : elements.conditionsToggle;
    setStatusOpen(false, false);
    setConditionsOpen(false, false);
    setChartOpen(false, false);
  }
  paused = open;
  interruptLessonAttempt();
  previousState = state;
  elements.gameShell.classList.toggle("is-paused", open);
  elements.gameShell.dataset.simulationPaused = String(isSimulationPaused());
  elements.pauseToggle.setAttribute("aria-expanded", String(open));
  elements.pauseScreen.hidden = !open;
  if (open) showPauseMenu();
  else if (restoreFocus && started) (pauseOpener.closest('.top-actions') ? pauseOpener : elements.conditionsToggle).focus({ preventScroll: true });
}

function setChartOpen(open: boolean, restoreFocus = true): void {
  if (open) setStatusOpen(false, false);
  if (open) interruptLessonAttempt();
  if (open && isConditionsOpen()) setConditionsOpen(false, false);
  const pauseSimulation = open && started;
  elements.chartPanel.classList.toggle("is-open", open);
  elements.chartPanel.setAttribute("aria-hidden", String(!open));
  elements.mapToggle.setAttribute("aria-expanded", String(open));
  elements.chartBackdrop.hidden = !open;
  elements.gameShell.classList.toggle("is-chart-open", open);
  elements.gameShell.dataset.simulationPaused = String(
    isSimulationPaused(),
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
  if (open) setStatusOpen(false, false);
  if (open) interruptLessonAttempt();
  if (open && isChartOpen()) setChartOpen(false, false);
  const pauseSimulation = open && started;
  elements.conditionsPanel.classList.toggle("is-open", open);
  elements.conditionsPanel.setAttribute("aria-hidden", String(!open));
  elements.conditionsToggle.setAttribute("aria-expanded", String(open));
  elements.conditionsBackdrop.hidden = !open;
  elements.gameShell.classList.toggle("is-settings-open", open);
  elements.gameShell.dataset.simulationPaused = String(
    isSimulationPaused(),
  );
  elements.settingsResume.querySelector("[data-label]")!.textContent = paused ? "Back to pause" : pauseSimulation ? "Resume sailing" : "Back to title";
  elements.settingsResume.querySelector("use")!.setAttribute("href", `/brand/fairwinds-icons.svg#${paused ? "fw-chevron-left" : "fw-play"}`);
  elements.settingsResume.querySelector("svg")!.style.display = pauseSimulation ? "" : "none";
  elements.settingsMainMenu.hidden = !started;
  elements.pauseToggle.hidden = !started || paused;
  if (pauseSimulation) {
    accumulator = 0;
    previousState = state;
  }
  if (open) {
    const activeTab = settingsTabs.tabs.find((tab) => tab.classList.contains("is-active"));
    activeTab?.focus({ preventScroll: true });
  }
  else if (paused) showPauseMenu(elements.pauseSettings);
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
  updateRangeFill(required<HTMLInputElement>(`#${id}`));
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
    playback.error,
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
  interruptLessonAttempt();
  if (firstBuoy) {
    firstBuoy = undefined;
    progress.activeIntroduction = undefined;
    persistProgress();
    elements.status.textContent = "Conditions changed. Free sailing; choose the first journey to try again.";
  }
  weatherSystem.setConfig(weatherConfig);
  weather = weatherSystem.sample(simulationTime);
  audio.setSeed(weatherConfig.seed);
  saveStoredValue("fair-winds-weather", JSON.stringify(weatherConfig));
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
  const preset = Object.entries(WEATHER_PRESETS).find(([, config]) => JSON.stringify(config) === JSON.stringify(weatherConfig));
  setValue("weather-preset", preset?.[0] ?? "custom");
  setValue("sea-state", matchingSeaState());
  required<HTMLOutputElement>("#wind-speed-output").value = `${(weatherConfig.wind.speed * 1.94384).toFixed(1)} kn`;
  const direction = Math.round(weatherConfig.wind.directionFromDegrees);
  const directions = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
  required<HTMLOutputElement>("#wind-direction-output").value = `${direction}° · ${directions[Math.round(direction / 45) % 8]}`;
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
  if (element instanceof HTMLInputElement && element.type === "range") updateRangeFill(element);
}

function updateRangeFill(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  input.style.setProperty("--range-fill", `${max > min ? 100 * (Number(input.value) - min) / (max - min) : 0}%`);
}

function loadStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    storageUnavailable = true;
    return null;
  }
}

function saveStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    storageUnavailable = true;
  }
}

function loadWeatherConfig(): WeatherConfig {
  try {
    const stored = loadStoredValue("fair-winds-weather");
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
  const stored = loadStoredValue("fair-winds-boat");
  if (
    stored === "harbor-20" ||
    stored === "cove-24" ||
    stored === "coastal-28" ||
    stored === "sound-30" ||
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
