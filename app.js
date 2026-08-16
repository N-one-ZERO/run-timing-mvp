import { evaluateWeather, findClosestForecastIndex, formatNumber } from "./logic.mjs";
import { REGIONS, REGION_CENTERS, KNOWN_COORDS, getLocationName } from "./regions.mjs";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const VARIANT = "recurring_quiz_v2";
const SCENES = ["intro", "location", "days", "time", "temperature", "rain", "loading", "result"];
const STEP_META = {
  location: [1, "지역 설정"],
  days: [2, "반복 요일"],
  time: [3, "시작 시각"],
  temperature: [4, "체감온도"],
  rain: [5, "강수 기준"],
};
const BACK_MAP = { location: "intro", days: "location", time: "days", temperature: "time", rain: "temperature", result: "rain" };
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

const state = {
  scene: "intro",
  location: null,
  selectedDays: new Set(),
  time: null,
  minTemperature: 10,
  maxTemperature: 25,
  maxPrecipitation: 20,
  startedAt: null,
  selectedRegion: "",
  selectedDistrict: "",
};

const viewedSteps = new Set();
const completedSteps = new Set();
let demoStarted = false;
let demoCompleted = false;
let alertClicked = false;
let abandonmentTracked = false;

function track(eventName, parameters = {}) {
  if (typeof window.gtag !== "function") return;
  const debug = new URLSearchParams(window.location.search).get("debug") === "1";
  window.gtag("event", eventName, { page_variant: VARIANT, ...parameters, ...(debug ? { debug_mode: true } : {}) });
}

function markStarted(source = "intro") {
  if (demoStarted) return;
  demoStarted = true;
  state.startedAt = Date.now();
  track("demo_started", { entry_source: source, flow_type: "recurring_schedule" });
}

function durationBucket() {
  const seconds = Math.round((Date.now() - (state.startedAt || Date.now())) / 1000);
  if (seconds < 30) return "under_30s";
  if (seconds < 60) return "30_to_59s";
  if (seconds < 120) return "60_to_119s";
  return "120s_plus";
}

function completeStep(name, answerType) {
  if (completedSteps.has(name)) return;
  completedSteps.add(name);
  track("demo_step_completed", { step_name: name, step_number: STEP_META[name][0], answer_type: answerType });
}

function showScene(name, options = {}) {
  const previous = state.scene;
  state.scene = name;
  $$('[data-scene]').forEach((scene) => {
    const active = scene.dataset.scene === name;
    scene.hidden = !active;
    scene.classList.toggle("is-active", active);
  });

  const meta = STEP_META[name];
  const hasProgress = Boolean(meta);
  $("#progress-wrap").hidden = !hasProgress;
  $("#back-button").hidden = !(name in BACK_MAP);
  if (hasProgress) {
    $("#progress-current").textContent = meta[0];
    $("#progress-label").textContent = meta[1];
    $("#progress-fill").style.width = `${meta[0] * 20}%`;
    if (!viewedSteps.has(name)) {
      viewedSteps.add(name);
      track("demo_step_viewed", { step_name: name, step_number: meta[0] });
    }
  }
  if (options.fromBack) track("demo_back_clicked", { from_step: previous, to_step: name });
  document.title = name === "intro" ? "런타이밍 | 반복 러닝 날씨 알림" : `${meta?.[1] || "결과"} | 런타이밍`;
}

function renderRegions() {
  const select = $("#region-select");
  select.insertAdjacentHTML("beforeend", Object.keys(REGIONS).map((region) => `<option value="${region}">${region}</option>`).join(""));
}

function selectRegion(region) {
  state.selectedRegion = region;
  state.selectedDistrict = "";
  const districtSelect = $("#district-select");
  districtSelect.innerHTML = '<option value="">시·군·구를 선택해주세요</option>';
  if (!region) {
    districtSelect.disabled = true;
    $("#district-field").classList.add("is-disabled");
    $("#location-next").disabled = true;
    updateSelectedLocation();
    return;
  }
  districtSelect.insertAdjacentHTML("beforeend", REGIONS[region].map((district) => `<option value="${district}">${district}</option>`).join(""));
  districtSelect.disabled = false;
  $("#district-field").classList.remove("is-disabled");
  updateSelectedLocation();
}

function updateSelectedLocation() {
  const label = $("#selected-location strong");
  if (!state.selectedRegion) label.textContent = "아직 선택하지 않았어요";
  else if (!state.selectedDistrict) label.textContent = `${state.selectedRegion} · 시·군·구를 선택해주세요`;
  else label.textContent = getLocationName(state.selectedRegion, state.selectedDistrict);
  $("#location-next").disabled = !(state.selectedRegion && state.selectedDistrict);
}

async function resolveSelectedLocation() {
  if (!state.selectedRegion || !state.selectedDistrict) return;
  const button = $("#location-next");
  const error = $("#location-error");
  const name = getLocationName(state.selectedRegion, state.selectedDistrict);
  button.disabled = true;
  button.innerHTML = '지역을 확인하고 있어요 <span class="mini-spinner" aria-hidden="true"></span>';
  error.hidden = true;

  let coordinates = KNOWN_COORDS[name];
  let usedFallback = false;
  if (!coordinates) {
    try {
      const query = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "kr", q: `${name} 대한민국` });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, { headers: { "Accept-Language": "ko" } });
      if (!response.ok) throw new Error("geocoding failed");
      const [match] = await response.json();
      if (match) coordinates = [Number(match.lat), Number(match.lon)];
    } catch {
      coordinates = null;
    }
  }
  if (!coordinates) {
    coordinates = REGION_CENTERS[state.selectedRegion];
    usedFallback = true;
  }

  state.location = { latitude: coordinates[0], longitude: coordinates[1], name, type: "preset_district" };
  if (usedFallback) track("location_geocode_fallback", { location_type: "preset_district" });
  completeStep("location", "preset_district");
  button.innerHTML = '이 지역으로 시작하기 <span>→</span>';
  button.disabled = false;
  showScene("days");
}

function getNextOccurrence() {
  const [hour, minute] = state.time.split(":").map(Number);
  const now = new Date();
  let next = null;
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (state.selectedDays.has(candidate.getDay()) && candidate.getTime() > now.getTime() + 5 * 60_000) {
      next = candidate;
      break;
    }
  }
  if (!next) {
    next = new Date(now);
    next.setDate(now.getDate() + 7);
    while (!state.selectedDays.has(next.getDay())) next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);
  }
  const timezoneOffset = next.getTimezoneOffset() * 60_000;
  return {
    date: next,
    apiTime: new Date(next.getTime() - timezoneOffset).toISOString().slice(0, 16),
  };
}

async function fetchForecast(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: "apparent_temperature,precipitation_probability,weather_code",
    timezone: "auto",
    forecast_days: "16",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("날씨 정보를 불러오지 못했습니다.");
  const data = await response.json();
  if (!data.hourly?.time?.length) throw new Error("다음 일정의 예보가 아직 없습니다.");
  return data;
}

function formatScheduleTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, "0")}`;
}

function scheduleText() {
  const days = [...state.selectedDays].sort((a, b) => (a || 7) - (b || 7)).map((day) => DAY_NAMES[day]).join("·");
  return `매주 ${days} ${formatScheduleTime(state.time)}`;
}

function renderResult(weather, decision, occurrence) {
  const main = $(".result-card");
  main.classList.toggle("is-negative", !decision.eligible);
  $("#result-icon").textContent = decision.eligible ? "✓" : "!";
  $("#result-label").textContent = decision.eligible ? "달릴 준비 완료" : "조건을 다시 확인해요";
  $("#result-title").textContent = decision.eligible ? "다음 일정, 달리기 좋아요." : "오늘 러닝은 집콕이다!!";
  $("#result-schedule").textContent = scheduleText();
  $("#result-time").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(occurrence.date);
  $("#result-location").textContent = state.location.name;
  $("#result-temp").textContent = `${formatNumber(weather.apparentTemperature)}°C`;
  $("#result-rain").textContent = `${formatNumber(weather.precipitationProbability)}%`;
  $("#result-temp-limit").textContent = `내 기준 ${state.minTemperature}–${state.maxTemperature}°C`;
  $("#result-rain-limit").textContent = `내 기준 ${state.maxPrecipitation}% 이하`;
  $("#result-temp-card").classList.toggle("is-over", !decision.reasons[0].pass);
  $("#result-rain-card").classList.toggle("is-over", !decision.reasons[1].pass);
  $("#dialog-schedule").textContent = `${scheduleText()}, 시작 30분 전에 날씨를 자동으로 확인하는 기능을 준비하고 있어요.`;
  showScene("result");
}

async function previewRecurringSchedule() {
  const error = $("#weather-error");
  error.hidden = true;
  showScene("loading");
  const loadingStart = Date.now();
  try {
    const occurrence = getNextOccurrence();
    const forecast = await fetchForecast(state.location);
    const index = findClosestForecastIndex(forecast.hourly.time, occurrence.apiTime);
    if (index < 0) throw new Error("다음 일정과 가까운 예보를 찾지 못했습니다.");
    const weather = {
      apparentTemperature: forecast.hourly.apparent_temperature[index],
      precipitationProbability: forecast.hourly.precipitation_probability[index] ?? 0,
    };
    const decision = evaluateWeather(weather, {
      minTemperature: state.minTemperature,
      maxTemperature: state.maxTemperature,
      maxPrecipitation: state.maxPrecipitation,
    });
    const remaining = Math.max(0, 850 - (Date.now() - loadingStart));
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
    renderResult(weather, decision, occurrence);
    const parameters = {
      eligible: decision.eligible ? "true" : "false",
      reason_code: decision.reasonCode,
      location_type: state.location.type,
      selected_day_count: state.selectedDays.size,
      time_bucket: Number(state.time.slice(0, 2)) < 12 ? "morning" : Number(state.time.slice(0, 2)) < 18 ? "daytime" : "evening",
      completion_time: durationBucket(),
    };
    if (!demoCompleted) {
      demoCompleted = true;
      track("demo_completed", parameters);
    } else {
      track("demo_retried", parameters);
    }
  } catch (caught) {
    track("weather_fetch_failed", { location_type: state.location?.type || "unknown", error_type: "forecast_unavailable" });
    showScene("rain");
    error.textContent = caught instanceof Error ? caught.message : "날씨 확인 중 오류가 발생했습니다. 다시 선택해주세요.";
    error.hidden = false;
  }
}

function updateTemperatureRange(changed = "min") {
  let min = Number($("#temp-min").value);
  let max = Number($("#temp-max").value);
  if (min > max - 1) {
    if (changed === "min") min = max - 1;
    else max = min + 1;
  }
  $("#temp-min").value = min;
  $("#temp-max").value = max;
  state.minTemperature = min;
  state.maxTemperature = max;
  $("#temp-output").textContent = `${min}°C – ${max}°C`;
  const start = ((min + 10) / 45) * 100;
  const end = ((max + 10) / 45) * 100;
  $("#temp-range-fill").style.left = `${start}%`;
  $("#temp-range-fill").style.width = `${end - start}%`;
}

$("#start-button").addEventListener("click", () => { markStarted("intro_button"); showScene("location"); });
$("#brand-home").addEventListener("click", (event) => { event.preventDefault(); showScene("intro"); });
$("#back-button").addEventListener("click", () => showScene(BACK_MAP[state.scene] || "intro", { fromBack: true }));
$("#region-select").addEventListener("change", (event) => selectRegion(event.target.value));
$("#district-select").addEventListener("change", (event) => {
  state.selectedDistrict = event.target.value;
  updateSelectedLocation();
});
$("#location-next").addEventListener("click", resolveSelectedLocation);

$$('[data-day]').forEach((button) => button.addEventListener("click", () => {
  const day = Number(button.dataset.day);
  if (state.selectedDays.has(day)) state.selectedDays.delete(day);
  else state.selectedDays.add(day);
  const selected = state.selectedDays.has(day);
  button.classList.toggle("is-selected", selected);
  button.setAttribute("aria-pressed", String(selected));
  $("#days-next").disabled = state.selectedDays.size === 0;
  $("#day-hint").textContent = state.selectedDays.size ? `${state.selectedDays.size}개 요일을 선택했어요.` : "요일을 한 개 이상 선택해주세요.";
}));
$("#days-next").addEventListener("click", () => {
  if (!state.selectedDays.size) return;
  completeStep("days", state.selectedDays.size > 1 ? "multiple_days" : "single_day");
  showScene("time");
});

$$('[data-time]').forEach((button) => button.addEventListener("click", () => {
  state.time = button.dataset.time;
  completeStep("time", "preset_time");
  window.setTimeout(() => showScene("temperature"), 160);
}));
$("#custom-time-next").addEventListener("click", () => {
  state.time = $("#custom-time").value;
  if (!state.time) return;
  completeStep("time", "custom_time");
  showScene("temperature");
});

$("#temp-min").addEventListener("input", () => { updateTemperatureRange("min"); $$('.preset-row button').forEach((button) => button.classList.remove("is-selected")); });
$("#temp-max").addEventListener("input", () => { updateTemperatureRange("max"); $$('.preset-row button').forEach((button) => button.classList.remove("is-selected")); });
$$('[data-temp-preset]').forEach((button) => button.addEventListener("click", () => {
  const [min, max] = button.dataset.tempPreset.split(",");
  $("#temp-min").value = min;
  $("#temp-max").value = max;
  updateTemperatureRange();
  $$('[data-temp-preset]').forEach((item) => item.classList.toggle("is-selected", item === button));
}));
$("#temperature-next").addEventListener("click", () => { completeStep("temperature", "range"); showScene("rain"); });

$$('[data-rain]').forEach((button) => button.addEventListener("click", () => {
  state.maxPrecipitation = Number(button.dataset.rain);
  completeStep("rain", `threshold_${state.maxPrecipitation}`);
  previewRecurringSchedule();
}));

$("#use-location").addEventListener("click", () => {
  markStarted("current_location");
  const button = $("#use-location");
  const error = $("#location-error");
  error.hidden = true;
  if (!navigator.geolocation) {
    error.textContent = "이 브라우저에서는 현재 위치를 사용할 수 없습니다.";
    error.hidden = false;
    return;
  }
  button.disabled = true;
  button.textContent = "현재 위치를 확인하고 있어요…";
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    state.location = { latitude: coords.latitude, longitude: coords.longitude, name: "현재 위치", type: "current_location" };
    button.textContent = "✓ 현재 위치를 적용했어요";
    button.disabled = false;
    completeStep("location", "current_location");
    showScene("days");
  }, () => {
    error.textContent = "위치 권한을 확인하지 못했습니다. 가까운 구·군을 선택해주세요.";
    error.hidden = false;
    button.innerHTML = '<span aria-hidden="true">◎</span> 현재 위치 사용하기';
    button.disabled = false;
  }, { enableHighAccuracy: false, timeout: 8_000, maximumAge: 600_000 });
});

$("#retry-button").addEventListener("click", () => { track("demo_retry_started", { restart_step: "days" }); showScene("days"); });
$("#alert-cta").addEventListener("click", () => {
  if (!alertClicked) {
    alertClicked = true;
    track("alert_setup_clicked", {
      cta_location: "result_panel",
      selected_day_count: state.selectedDays.size,
      location_type: state.location.type,
      completion_time: durationBucket(),
    });
  }
  localStorage.setItem("runtime_recurring_interest", new Date().toISOString());
  const dialog = $("#interest-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
});
$(".dialog-close").addEventListener("click", () => $("#interest-dialog").close());
$(".dialog-confirm").addEventListener("click", () => $("#interest-dialog").close());
$("#interest-dialog").addEventListener("click", (event) => { if (event.target === $("#interest-dialog")) $("#interest-dialog").close(); });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && demoStarted && !demoCompleted && !abandonmentTracked) {
    abandonmentTracked = true;
    track("demo_abandoned", { last_step: state.scene, completed_step_count: completedSteps.size, elapsed_time: durationBucket() });
  }
});

renderRegions();
updateTemperatureRange();
showScene("intro");
track("landing_viewed", { flow_type: "recurring_schedule" });
