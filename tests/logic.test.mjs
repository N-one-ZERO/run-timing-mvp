import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWeather, findClosestForecastIndex } from "../logic.mjs";

test("모든 조건에 맞으면 적합으로 판정한다", () => {
  const result = evaluateWeather(
    { apparentTemperature: 17, precipitationProbability: 10 },
    { minTemperature: 10, maxTemperature: 25, maxPrecipitation: 20 },
  );
  assert.equal(result.eligible, true);
  assert.equal(result.reasonCode, "all_conditions_met");
  assert.ok(result.reasons.every((reason) => reason.pass));
});

test("강수확률이 기준을 넘으면 부적합 이유를 반환한다", () => {
  const result = evaluateWeather(
    { apparentTemperature: 17, precipitationProbability: 70 },
    { minTemperature: 10, maxTemperature: 25, maxPrecipitation: 20 },
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reasonCode, "precipitation_high");
});

test("체감온도가 너무 낮으면 부적합 이유를 반환한다", () => {
  const result = evaluateWeather(
    { apparentTemperature: 4, precipitationProbability: 0 },
    { minTemperature: 10, maxTemperature: 25, maxPrecipitation: 20 },
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reasonCode, "temperature_low");
});

test("가장 가까운 예보 시간의 인덱스를 찾는다", () => {
  const times = ["2026-08-16T19:00", "2026-08-16T20:00", "2026-08-16T21:00"];
  assert.equal(findClosestForecastIndex(times, "2026-08-16T20:20"), 1);
});
