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
  next-development-steps.md

/src
  types.ts
  scoring.ts
  normalization.ts
  sample-destinations.ts
  example-run.ts

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
```

## 당장 하지 않을 것

- 실시간 항공권 API
- 실시간 호텔 API
- 커뮤니티
- 리뷰 시스템
- 로그인
- 결제

위 기능들은 MVP 반응을 본 뒤에 붙입니다.
