import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

test("sample the current soundscape only when an audio mix is due", () => {
  const source = readFileSync(new URL("../src/audio/game-audio.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(source, { mode: "strip" })
    .replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, "");
  const marker = new Error("mix reached");
  const calls = [];
  const GameAudio = runInNewContext(`${js}\nGameAudio`, {
    createRandom: () => () => 0.5,
    loadAudioSettings: () => ({}),
    computeAudioMixTargets: () => ({}),
    sampleSoundscape: (world, position) => { calls.push([world, position]); throw marker; },
  });
  const audio = new GameAudio();
  const world = {}, state = { position: { x: 3, y: 8 } };
  audio.update({}, state, {}, world);
  audio.context = { currentTime: 2 };
  audio.lastUpdateAt = 1.99;
  audio.update({}, state, {}, world);
  assert.equal(calls.length, 0);
  state.position = { x: 9, y: 4 };
  audio.context.currentTime = 2.04;
  assert.throws(() => audio.update({}, state, {}, world), error => error === marker);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], world);
  assert.equal(calls[0][1], state.position);
});
