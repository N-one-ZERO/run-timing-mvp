import { evaluateWeather, findClosestForecastIndex, formatNumber, formatPlannedTime } from "./logic.mjs";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const form = $("#weather-form");
const plannedTime = $("#planned-time");
const locationSelect = $("#location");
const minInput = $("#temp-min");
const maxInput = $("#temp-max");
const rainInput = $("#rain-max");
const errorMessage = $("#form-error");
const judgeButton = $("#judge-button");
const dialog = $("#interest-dialog");
let currentCoordinates = null;
let demoStarted = false;

function track(eventName, parameters = {}) {
  if (typeof window.gtag === "function") {
    const debug = new URLSearchParams(window.location.search).get("debug") === "1";
    window.gtag("event", eventName, { ...parameters, ...(debug ? { debug_mode: true } : {}) });
  }
}

function setDefaultTime() {
  const date = new Date();
  date.setHours(date.getHours() + 2, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  plannedTime.value = new Date(date.getTime() - offset).toISOString().slice(0, 16);

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 6);
  plannedTime.min = new Date(Date.now() - offset).toISOString().slice(0, 16);
  plannedTime.max = new Date(maxDate.getTime() - offset).toISOString().slice(0, 16);
}

function markDemoStarted(source = "demo_section") {
  if (demoStarted) return;
  demoStarted = true;
  track("demo_started", { entry_source: source });
}

function showStep(step) {
  $$("[data-step-panel]").forEach((panel) => {
    const active = Number(panel.dataset.stepPanel) === step;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$("[data-step-indicator]").forEach((indicator) => {
    const number = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle("is-active", number === step);
    indicator.classList.toggle("is-complete", number < step);
  });
}

function validateStepOne() {
  hideError();
  if (!plannedTime.value) {
    showError("러닝 예정 시각을 선택해주세요.");
    plannedTime.focus();
    return false;
  }
  const selected = new Date(plannedTime.value);
  if (selected.getTime() < Date.now() - 30 * 60_000) {
    showError("현재 이후의 러닝 예정 시각을 선택해주세요.");
    plannedTime.focus();
    return false;
  }
  return true;
}

function updateTemperatureRange(changed) {
  let min = Number(minInput.value);
  let max = Number(maxInput.value);
  if (min > max - 1) {
    if (changed === "min") min = max - 1;
    else max = min + 1;
  }
  minInput.value = min;
  maxInput.value = max;
  $("#temp-output").textContent = `${min}°C – ${max}°C`;
  const start = ((min + 10) / 45) * 100;
  const end = ((max + 10) / 45) * 100;
  const fill = $("#temp-range-fill");
  fill.style.left = `${start}%`;
  fill.style.width = `${end - start}%`;
}

function updateRainRange() {
  $("#rain-output").textContent = `${rainInput.value}% 이하`;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function hideError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

function getLocation() {
  if (currentCoordinates) return currentCoordinates;
  const [latitude, longitude, name] = locationSelect.value.split(",");
  return { latitude: Number(latitude), longitude: Number(longitude), name };
}

async function fetchForecast(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: "apparent_temperature,precipitation_probability,weather_code",
    timezone: "auto",
    forecast_days: "7",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("날씨 정보를 불러오지 못했습니다.");
  const data = await response.json();
  if (!data.hourly?.time?.length) throw new Error("선택한 시간대의 예보가 아직 없습니다.");
  return data;
}

function renderResult(weather, decision, locationName) {
  const status = $("#result-status");
  status.classList.toggle("is-negative", !decision.eligible);
  $("#result-icon").textContent = decision.eligible ? "✓" : "!";
  $("#result-kicker").textContent = `${locationName} · 오늘의 판정`;
  $("#result-title").textContent = decision.eligible ? "달리기 좋은 날이에요!" : "오늘은 조건에 맞지 않아요.";
  $("#result-description").textContent = decision.eligible
    ? "입력한 체감온도와 강수확률 기준을 모두 충족해요."
    : "맞지 않는 조건을 확인하고 러닝 여부를 결정해보세요.";
  $("#result-time").textContent = formatPlannedTime(plannedTime.value);
  $("#result-temp").textContent = `${formatNumber(weather.apparentTemperature)}°C`;
  $("#result-rain").textContent = `${formatNumber(weather.precipitationProbability)}%`;
  $("#reason-list").innerHTML = decision.reasons
    .map((reason) => `<div class="reason-item ${reason.pass ? "" : "is-fail"}"><span class="reason-badge">${reason.pass ? "✓" : "!"}</span><span>${reason.message}</span></div>`)
    .join("");
  showStep(3);
  $("[data-step-panel='3']").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleSubmit(event) {
  event.preventDefault();
  hideError();
  if (!validateStepOne()) {
    showStep(1);
    return;
  }

  judgeButton.disabled = true;
  judgeButton.classList.add("is-loading");
  try {
    const location = getLocation();
    const forecast = await fetchForecast(location);
    const index = findClosestForecastIndex(forecast.hourly.time, plannedTime.value);
    if (index < 0 || Math.abs(new Date(forecast.hourly.time[index]) - new Date(plannedTime.value)) > 90 * 60_000) {
      throw new Error("선택한 시각과 가까운 예보를 찾지 못했습니다. 7일 이내의 시각을 골라주세요.");
    }
    const weather = {
      apparentTemperature: forecast.hourly.apparent_temperature[index],
      precipitationProbability: forecast.hourly.precipitation_probability[index] ?? 0,
    };
    const decision = evaluateWeather(weather, {
      minTemperature: minInput.value,
      maxTemperature: maxInput.value,
      maxPrecipitation: rainInput.value,
    });
    renderResult(weather, decision, location.name);
    track("demo_completed", {
      eligible: decision.eligible ? "true" : "false",
      reason_code: decision.reasonCode,
      location_type: currentCoordinates ? "current_location" : "preset_city",
      planned_time_bucket: new Date(plannedTime.value).getHours() < 18 ? "daytime" : "evening",
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : "날씨 판정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    judgeButton.disabled = false;
    judgeButton.classList.remove("is-loading");
  }
}

$$('[data-start-demo]').forEach((link) => link.addEventListener("click", () => markDemoStarted(link.closest("header") ? "header" : "hero")));
$("[data-next-step='2']").addEventListener("click", () => {
  markDemoStarted("form");
  if (validateStepOne()) showStep(2);
});
$("[data-prev-step='1']").addEventListener("click", () => showStep(1));
minInput.addEventListener("input", () => updateTemperatureRange("min"));
maxInput.addEventListener("input", () => updateTemperatureRange("max"));
rainInput.addEventListener("input", updateRainRange);
form.addEventListener("submit", handleSubmit);

locationSelect.addEventListener("change", () => { currentCoordinates = null; });
$("#use-location").addEventListener("click", () => {
  markDemoStarted("current_location");
  const button = $("#use-location");
  if (!navigator.geolocation) {
    showError("이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다.");
    return;
  }
  button.disabled = true;
  button.textContent = "현재 위치를 확인하고 있어요…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      currentCoordinates = { latitude: coords.latitude, longitude: coords.longitude, name: "현재 위치" };
      button.textContent = "✓ 현재 위치가 적용되었어요";
      button.disabled = false;
    },
    () => {
      showError("위치 권한을 확인하지 못했습니다. 목록에서 가까운 지역을 선택해주세요.");
      button.innerHTML = '<span aria-hidden="true">◎</span> 현재 위치로 확인하기';
      button.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 8_000, maximumAge: 600_000 },
  );
});

$("#retry-button").addEventListener("click", () => showStep(2));
$("#alert-cta").addEventListener("click", () => {
  track("alert_setup_clicked", { cta_location: "result_panel" });
  localStorage.setItem("runtime_interest_clicked", new Date().toISOString());
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
});
$(".dialog-close").addEventListener("click", () => dialog.close());
$(".dialog-confirm").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

setDefaultTime();
updateTemperatureRange("min");
updateRainRange();
track("landing_viewed", { page_variant: "interactive_landing_v1" });
