# RunTiming 1차 MVP

평소 러닝 요일·시간과 날씨 기준을 한 번 설정하면 반복 일정마다 날씨를 대신 확인하고 알림을 주는 경험을 검증하는 인터랙티브 랜딩페이지입니다.

## 주요 기능

- 전국 17개 시·도의 시·군·구 또는 현재 위치 선택
- 반복 요일과 평소 러닝 시작 시각 설정
- 허용 체감온도 및 강수확률 설정
- Open-Meteo 시간대별 예보로 첫 반복 일정 미리보기
- GA4 핵심 퍼널 이벤트 수집
- 모바일·데스크톱 반응형 화면

한 화면에서 `시·도 및 시·군·구 → 반복 요일 → 시작 시각 → 체감온도 → 강수 기준 → 첫 일정 미리보기` 순으로 진행합니다. 일반 시 내부에 행정구가 있는 지역은 `경기도 수원시 권선구`처럼 구 단위까지 선택할 수 있습니다. 반복 알림 CTA는 수요 검증용입니다.

## GA4 이벤트

- 핵심 KPI: `landing_viewed`, `demo_started`, `demo_completed`, `alert_setup_clicked`
- 이탈 진단: `demo_step_viewed`, `demo_step_completed`, `demo_back_clicked`, `demo_abandoned`
- 품질 진단: `weather_fetch_failed`, `demo_retried`, `demo_retry_started`

핵심 KPI 이벤트는 한 페이지 세션에서 최초 한 번만 전송해 반복 클릭으로 인한 전환율 왜곡을 방지합니다. 모든 커스텀 이벤트에는 `page_variant=recurring_quiz_v2`가 포함됩니다.

GA4 DebugView 확인 시 배포 URL 뒤에 `?debug=1`을 붙입니다.

## 로컬 실행 및 테스트

정적 파일이므로 로컬 웹 서버에서 `index.html`을 열면 됩니다.

```bash
python -m http.server 4173
```

판정 로직 테스트:

```bash
node --test tests/logic.test.mjs tests/tracking-audit.test.mjs
```

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 테스트 후 GitHub Pages에 자동 배포합니다. 저장소의 **Settings → Pages → Source**는 `GitHub Actions`로 설정합니다.

## 데이터 출처

날씨 데이터는 [Open-Meteo](https://open-meteo.com/)를 사용합니다. 비상업적 교육용 MVP이며, Open-Meteo 이용 정책과 출처 표기를 따릅니다.
