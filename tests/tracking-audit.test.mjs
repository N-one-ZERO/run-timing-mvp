import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("GA4 measurement ID is installed", () => {
  assert.match(html, /G-4GZ549TMQ6/);
});

test("one-screen recurring schedule flow contains all scenes", () => {
  for (const scene of ["intro", "location", "days", "time", "temperature", "rain", "loading", "result"]) {
    assert.match(html, new RegExp(`data-scene=["']${scene}["']`));
  }
  assert.match(html, /구·군/);
  assert.match(html, /반복 알림/);
});

test("core KPI events and diagnostic events are implemented", () => {
  for (const event of [
    "landing_viewed",
    "demo_started",
    "demo_completed",
    "alert_setup_clicked",
    "demo_step_viewed",
    "demo_step_completed",
    "demo_abandoned",
    "weather_fetch_failed",
  ]) {
    assert.match(app, new RegExp(`["']${event}["']`));
  }
});

test("core conversion events are guarded against repeat inflation", () => {
  assert.match(app, /if \(demoStarted\) return/);
  assert.match(app, /if \(!demoCompleted\)/);
  assert.match(app, /if \(!alertClicked\)/);
});
