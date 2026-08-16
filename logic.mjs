export function evaluateWeather(weather, preferences) {
  const temperature = Number(weather.apparentTemperature);
  const precipitation = Number(weather.precipitationProbability);
  const min = Number(preferences.minTemperature);
  const max = Number(preferences.maxTemperature);
  const rainMax = Number(preferences.maxPrecipitation);

  if (![temperature, precipitation, min, max, rainMax].every(Number.isFinite)) {
    throw new TypeError("판정에 필요한 날씨 또는 조건 값이 올바르지 않습니다.");
  }
  if (min > max) {
    throw new RangeError("최저 체감온도는 최고 체감온도보다 낮아야 합니다.");
  }

  const temperaturePass = temperature >= min && temperature <= max;
  const precipitationPass = precipitation <= rainMax;
  const reasons = [
    {
      code: temperaturePass ? "temperature_ok" : temperature < min ? "temperature_low" : "temperature_high",
      pass: temperaturePass,
      message: temperaturePass
        ? `체감온도 ${formatNumber(temperature)}°C가 설정 범위(${formatNumber(min)}–${formatNumber(max)}°C)에 들어와요.`
        : temperature < min
          ? `체감온도 ${formatNumber(temperature)}°C가 설정한 최저 기준 ${formatNumber(min)}°C보다 낮아요.`
          : `체감온도 ${formatNumber(temperature)}°C가 설정한 최고 기준 ${formatNumber(max)}°C보다 높아요.`,
    },
    {
      code: precipitationPass ? "precipitation_ok" : "precipitation_high",
      pass: precipitationPass,
      message: precipitationPass
        ? `강수확률 ${formatNumber(precipitation)}%로 허용 기준(${formatNumber(rainMax)}% 이하)에 맞아요.`
        : `강수확률 ${formatNumber(precipitation)}%로 허용 기준 ${formatNumber(rainMax)}%를 넘어요.`,
    },
  ];

  return {
    eligible: temperaturePass && precipitationPass,
    reasonCode: reasons.filter((reason) => !reason.pass).map((reason) => reason.code).join("+") || "all_conditions_met",
    reasons,
  };
}

export function findClosestForecastIndex(times, targetDate) {
  if (!Array.isArray(times) || !times.length) return -1;
  const target = new Date(targetDate).getTime();
  if (!Number.isFinite(target)) return -1;

  let closestIndex = -1;
  let closestDifference = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const difference = Math.abs(new Date(time).getTime() - target);
    if (Number.isFinite(difference) && difference < closestDifference) {
      closestDifference = difference;
      closestIndex = index;
    }
  });
  return closestIndex;
}

export function formatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export function formatPlannedTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
