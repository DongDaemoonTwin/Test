# Travel MVP Test

사지방 개발 가능 여부 테스트에서 시작한 여행지 선택 MVP 저장소입니다.

## 제품 한 문장

항공권·호텔을 예약하기 전에, 내 예산·일정·동행자·취향 기준으로 갈 만한 여행지를 좁혀주고 후보끼리 비교해 최종 선택을 도와주는 서비스.

## MVP 포지션

이 프로젝트는 처음부터 항공권·호텔 예약 플랫폼을 만들지 않습니다.

첫 MVP는 아래 문제에 집중합니다.

- 내 예산과 일정으로 갈 수 있는 여행지는 어디인가?
- 후보 여행지 중 무엇이 더 현실적인가?
- 왜 이 여행지는 추천되고, 왜 다른 여행지는 애매하거나 어려운가?

즉, 핵심은 여행 예약이 아니라 여행지 선택 의사결정입니다.

## 로컬 웹 프리뷰

Google Sheets나 Amadeus 연결이 없어도 화면 흐름을 먼저 볼 수 있도록 Vite 기반 샘플 웹 UI를 추가했습니다.

- Entry: `index.html`
- UI script: `src/web-main.ts`
- Styles: `src/web-styles.css`
- Data: `src/sample-destinations.ts`

Codespaces 또는 로컬에서 실행:

```bash
git pull
npm install
npm run dev -- --host 0.0.0.0
```

Vite 기본 포트는 `5173`입니다. Codespaces에서는 터미널에 뜨는 `localhost:5173` 링크를 누르거나, `PORTS` 탭에서 5173 포트를 열면 됩니다.

## 연결된 Google Sheets DB

현재 MVP seed DB는 아래 Google Sheets 파일을 기준으로 읽습니다.

- Spreadsheet ID: `1VyIVKXJijMQRJfnRMWXMvcQ0DmRpDDmGPqVKO5Eo8rA`
- File name: `recommended cities`
- Loader: `src/google-sheets.ts`
- Example: `src/example-google-sheets.ts`

사용하는 주요 탭:

- `Cities_Base`
- `City_Airports`
- `City_Monthly_Climate`
- `City_Intros`
- `City_Seasons`
- `City_Landmarks`
- `Cost_Profiles`
- `Style_Scores`
- `Companion_Scores`

각 탭은 `city_id` 기준으로 합쳐서 `Destination` 객체로 변환합니다.

새로 연결된 세 탭은 아래 객체에 반영됩니다.

- `Cost_Profiles` → `Destination.costProfile`
- `Style_Scores` → `Destination.styleScores`
- `Companion_Scores` → `Destination.companionScores`

`Cost_Profiles`, `Style_Scores`, `Companion_Scores`는 optional fallback을 지원합니다. 탭이나 특정 도시 행이 비어 있어도 앱은 기존 추정값/기본값으로 계속 실행됩니다.

### Google Sheets 접근 방식

`src/google-sheets.ts`는 두 가지 접근 방식을 지원합니다.

```bash
# 시트가 Anyone with the link can view 상태일 때
GOOGLE_SHEETS_ACCESS_MODE=public npm run sheet:example

# 시트가 비공개일 때
GOOGLE_SHEETS_ACCESS_MODE=service_account npm run sheet:example
```

`401` 에러가 나면 Codespaces에서 시트를 익명으로 읽지 못한다는 뜻입니다. 이 경우 시트를 `Anyone with the link can view`로 바꾸거나, 서비스 계정 환경변수를 설정하고 시트를 서비스 계정 이메일에 공유해야 합니다.

서비스 계정 모드에 필요한 환경변수:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account-email"
GOOGLE_PRIVATE_KEY="your-private-key-with-newlines-written-as-backslash-n"
```

자세한 내용은 `docs/google-sheets-connection.md`를 봅니다.

## Amadeus 가격 연동

항공권/호텔 평균가 추정을 위한 Amadeus 연동 뼈대를 추가했습니다.

- Code: `src/amadeus.ts`
- Example: `src/example-amadeus.ts`
- Docs: `docs/amadeus-price-integration.md`

필요한 환경변수:

```bash
AMADEUS_CLIENT_ID="your_api_key"
AMADEUS_CLIENT_SECRET="your_api_secret"
AMADEUS_BASE_URL="https://test.api.amadeus.com"
```

실행 예시:

```bash
npm run amadeus:example
```

현재는 실시간 예약이 아니라 가격 샘플을 가져와 `CostProfile`에 반영하는 목적입니다.

## 첫 MVP 페이지

| 페이지 | 기능 | 우선순위 |
|---|---|---|
| `/` | 조건 입력 | P0 |
| `/results` | 갈 만함 / 애매함 / 어려움 결과 | P0 |
| `/compare` | 선택한 도시 2~5개 비교 | P0 |
| `/city/[cityId]` | 도시 상세 정보 | P0.5 |

## 현재 저장소 구조

```text
/docs
  mvp-baseline.md
  database-schema.md
  google-sheets-connection.md
  amadeus-price-integration.md
  next-development-steps.md

/src
  types.ts
  scoring.ts
  normalization.ts
  google-sheets.ts
  amadeus.ts
  sample-destinations.ts
  web-main.ts
  web-styles.css
  example-run.ts
  example-google-sheets.ts
  example-amadeus.ts

index.html
package.json
tsconfig.json
```

## 핵심 개발 순서

1. Google Sheets에서 도시 데이터를 가져와 `Destination` 객체로 정규화한다.
2. 조건 입력값을 `UserTripCondition` 객체로 만든다.
3. 각 도시마다 점수를 계산한다.
4. 점수에 따라 `good`, `borderline`, `difficult`로 분류한다.
5. 결과 카드에 추천 이유와 주의점을 보여준다.

## 점수 공식

```text
score =
  feasibility * 30
+ seasonAndWeatherFit * 25
+ durationFit * 15
+ styleFit * 20
+ companionFit * 10
- cautionPenalty
```

코드에서는 0~100 기준으로 계산하고, 화면에는 숫자보다 별점과 설명을 중심으로 보여줍니다.

예시:

```text
추천도 ★★★★☆
이유: 짧은 일정에 적합하고, 음식·쇼핑 선호와 잘 맞으며, 예산 범위 안에 들어올 가능성이 높습니다.
주의: 성수기에는 항공권 가격이 올라갈 수 있습니다.
```

## 로컬 실행

```bash
npm install
npm run typecheck
npm run example
npm run dev -- --host 0.0.0.0
npm run sheet:example
npm run amadeus:example
```
