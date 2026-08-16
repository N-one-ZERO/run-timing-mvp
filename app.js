import { evaluateWeather, findClosestForecastIndex, formatNumber } from "./logic.mjs";

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

const REGIONS = {
  "서울": [
    ["강남구", 37.5172, 127.0473], ["강동구", 37.5301, 127.1238], ["강북구", 37.6396, 127.0257],
    ["강서구", 37.5509, 126.8495], ["관악구", 37.4784, 126.9516], ["광진구", 37.5385, 127.0823],
    ["구로구", 37.4955, 126.8877], ["금천구", 37.4569, 126.8955], ["노원구", 37.6542, 127.0568],
    ["도봉구", 37.6688, 127.0471], ["동대문구", 37.5744, 127.0396], ["동작구", 37.5124, 126.9393],
    ["마포구", 37.5663, 126.9019], ["서대문구", 37.5791, 126.9368], ["서초구", 37.4837, 127.0324],
    ["성동구", 37.5633, 127.0371], ["성북구", 37.5894, 127.0167], ["송파구", 37.5145, 127.1059],
    ["양천구", 37.5170, 126.8666], ["영등포구", 37.5264, 126.8963], ["용산구", 37.5326, 126.9900],
    ["은평구", 37.6027, 126.9291], ["종로구", 37.5735, 126.9790], ["중구", 37.5641, 126.9979],
    ["중랑구", 37.6063, 127.0927],
  ],
  "수원": [["장안구", 37.3039, 127.0101], ["권선구", 37.2577, 126.9719], ["팔달구", 37.2827, 127.0201], ["영통구", 37.2596, 127.0466]],
  "인천": [
    ["중구", 37.4737, 126.6216], ["동구", 37.4739, 126.6432], ["미추홀구", 37.4636, 126.6507],
    ["연수구", 37.4102, 126.6780], ["남동구", 37.4473, 126.7315], ["부평구", 37.5070, 126.7219],
    ["계양구", 37.5373, 126.7377], ["서구", 37.5454, 126.6760], ["강화군", 37.7465, 126.4880], ["옹진군", 37.4465, 126.6369],
  ],
  "대전": [["동구", 36.3120, 127.4549], ["중구", 36.3255, 127.4213], ["서구", 36.3555, 127.3838], ["유성구", 36.3623, 127.3562], ["대덕구", 36.3467, 127.4156]],
  "부산": [
    ["중구", 35.1065, 129.0324], ["서구", 35.0979, 129.0244], ["동구", 35.1293, 129.0454], ["영도구", 35.0912, 129.0679],
    ["부산진구", 35.1631, 129.0531], ["동래구", 35.2048, 129.0838], ["남구", 35.1366, 129.0842], ["북구", 35.1972, 128.9904],
    ["해운대구", 35.1631, 129.1636], ["사하구", 35.1045, 128.9748], ["금정구", 35.2429, 129.0922], ["강서구", 35.2122, 128.9805],
    ["연제구", 35.1762, 129.0798], ["수영구", 35.1456, 129.1132], ["사상구", 35.1526, 128.9910], ["기장군", 35.2445, 129.2223],
  ],
  "대구": [
    ["중구", 35.8694, 128.6062], ["동구", 35.8868, 128.6356], ["서구", 35.8718, 128.5592], ["남구", 35.8460, 128.5977],
    ["북구", 35.8859, 128.5829], ["수성구", 35.8582, 128.6307], ["달서구", 35.8299, 128.5327], ["달성군", 35.7746, 128.4314], ["군위군", 36.2429, 128.5729],
  ],
  "광주": [["동구", 35.1462, 126.9231], ["서구", 35.1520, 126.8901], ["남구", 35.1329, 126.9024], ["북구", 35.1741, 126.9119], ["광산구", 35.1396, 126.7937]],
  "제주": [["제주시", 33.4996, 126.5312], ["서귀포시", 33.2541, 126.5601]],
};

const state = {
  scene: "intro",
  location: null,
  selectedDays: new Set(),
  time: null,
  minTemperature: 10,
  maxTemperature: 25,
  maxPrecipitation: 20,
  startedAt: null,
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
  const container = $("#region-options");
  container.innerHTML = Object.keys(REGIONS).map((region) => `<button type="button" data-region="${region}">${region}</button>`).join("");
  $$('[data-region]', container).forEach((button) => button.addEventListener("click", () => selectRegion(button.dataset.region)));
}

function selectRegion(region) {
  $$('[data-region]').forEach((button) => button.classList.toggle("is-selected", button.dataset.region === region));
  const districtColumn = $("#district-column");
  districtColumn.classList.remove("is-waiting");
  $("#district-placeholder").hidden = true;
  const container = $("#district-options");
  container.innerHTML = REGIONS[region]
    .map(([district, latitude, longitude]) => `<button type="button" data-district="${district}" data-latitude="${latitude}" data-longitude="${longitude}">${district}</button>`)
    .join("");
  $$('[data-district]', container).forEach((button) => button.addEventListener("click", () => {
    $$('[data-district]', container).forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    state.location = {
      latitude: Number(button.dataset.latitude),
      longitude: Number(button.dataset.longitude),
      name: `${region} ${button.dataset.district}`,
      type: "preset_district",
    };
    completeStep("location", "preset_district");
    window.setTimeout(() => showScene("days"), 180);
  }));
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
  const main = $(".result-main");
  main.classList.toggle("is-negative", !decision.eligible);
  $("#result-icon").textContent = decision.eligible ? "✓" : "!";
  $("#result-kicker").textContent = decision.eligible ? "NEXT RUNNING · READY" : "NEXT RUNNING · CHECK";
  $("#result-title").textContent = decision.eligible ? "다음 일정에는 달리기 좋아요!" : "다음 일정은 기준에 맞지 않아요.";
  $("#result-description").textContent = decision.eligible
    ? "선택한 체감온도와 강수 기준을 모두 충족해요."
    : "반복 알림에서는 맞지 않는 이유도 함께 알려드려요.";
  $("#result-schedule").textContent = scheduleText();
  $("#result-time").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(occurrence.date);
  $("#result-location").textContent = state.location.name;
  $("#result-temp").textContent = `${formatNumber(weather.apparentTemperature)}°C`;
  $("#result-rain").textContent = `${formatNumber(weather.precipitationProbability)}%`;
  $("#reason-list").innerHTML = decision.reasons.map((reason) =>
    `<div class="reason-item ${reason.pass ? "" : "is-fail"}"><span class="reason-badge">${reason.pass ? "✓" : "!"}</span><span>${reason.message}</span></div>`
  ).join("");
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
