# RunTiming 1차 MVP

러닝 예정 시간의 체감온도와 강수확률을 개인 기준과 비교해 즉시 적합 여부를 보여주는 인터랙티브 랜딩페이지입니다.

## 주요 기능

- 국내 주요 지역 또는 현재 위치 선택
- 7일 이내 러닝 예정 시각 설정
- 허용 체감온도 및 강수확률 설정
- Open-Meteo 시간대별 예보 기반 적합·부적합 판정
- GA4 핵심 퍼널 이벤트 수집
- 모바일·데스크톱 반응형 화면

## GA4 이벤트

- `landing_viewed`
- `demo_started`
- `demo_completed`
- `alert_setup_clicked`

GA4 DebugView 확인 시 배포 URL 뒤에 `?debug=1`을 붙입니다.

## 로컬 실행 및 테스트

정적 파일이므로 로컬 웹 서버에서 `index.html`을 열면 됩니다.

```bash
python -m http.server 4173
```

판정 로직 테스트:

```bash
node --test tests/logic.test.mjs
```

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 테스트 후 GitHub Pages에 자동 배포합니다. 저장소의 **Settings → Pages → Source**는 `GitHub Actions`로 설정합니다.

## 데이터 출처

날씨 데이터는 [Open-Meteo](https://open-meteo.com/)를 사용합니다. 비상업적 교육용 MVP이며, Open-Meteo 이용 정책과 출처 표기를 따릅니다.
