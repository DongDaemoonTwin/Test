# Google Sheets DB 컬럼 설계

## 원칙

첫 MVP에서는 완벽한 여행 데이터베이스보다 추천과 비교에 필요한 최소 데이터가 중요하다.

따라서 데이터는 아래 4가지를 우선 지원해야 한다.

1. 예산 안에 들어오는지 판단
2. 여행 월과 계절이 맞는지 판단
3. 여행 기간이 적절한지 판단
4. 여행 스타일과 동행자 유형에 맞는지 판단

## 추천 탭 구조

### 1. `destinations`

도시의 기본 정보와 추천 계산에 필요한 핵심 컬럼.

| 컬럼명 | 타입 | 예시 | 설명 |
|---|---|---|---|
| city_id | string | fukuoka_japan | 고유 ID |
| city_name_ko | string | 후쿠오카 | 한국어 도시명 |
| city_name_en | string | Fukuoka | 영어 도시명 |
| country_ko | string | 일본 | 국가명 |
| country_en | string | Japan | 영어 국가명 |
| region | string | East Asia | 지역 |
| main_airport | string | FUK | 대표 공항 코드 |
| timezone | string | Asia/Tokyo | 타임존 |
| short_intro_ko | string | 짧은 일정과 음식 여행에 강한 도시 | 결과 카드 소개문 |
| keywords_ko | string | 맛집,쇼핑,짧은비행 | 쉼표 구분 키워드 |
| min_nights | number | 2 | 최소 추천 숙박일수 |
| ideal_nights | number | 3 | 이상적 숙박일수 |
| max_nights | number | 5 | 최대 추천 숙박일수 |
| best_months | string | 3,4,5,10,11 | 추천 월 |
| caution_months | string | 7,8 | 주의 월 |
| landmarks | string | 오호리공원,캐널시티,다자이후 | 주요 명소 |
| data_status | string | draft/reviewed/verified | 데이터 상태 |
| needs_review | boolean | TRUE/FALSE | 검토 필요 여부 |

### 2. `cost_profiles`

도시별 대략 비용 구간. MVP에서는 실시간 API 대신 평균 범위를 사용한다.

| 컬럼명 | 타입 | 예시 | 설명 |
|---|---|---|---|
| city_id | string | fukuoka_japan | destinations와 연결 |
| departure_city | string | ICN | 출발지 또는 공항 코드 |
| flight_cost_min | number | 250000 | 왕복 항공권 예상 최저 |
| flight_cost_max | number | 400000 | 왕복 항공권 예상 최고 |
| hotel_per_night_min | number | 70000 | 1박 숙소 예상 최저 |
| hotel_per_night_max | number | 120000 | 1박 숙소 예상 최고 |
| daily_local_cost_min | number | 70000 | 하루 현지 체류비 최저 |
| daily_local_cost_max | number | 120000 | 하루 현지 체류비 최고 |
| currency | string | KRW | 비용 통화 |
| cost_note | string | 성수기 항공권 변동 큼 | 비용 관련 주의점 |

### 3. `style_scores`

도시별 여행 스타일 적합도. 점수는 1~5를 사용한다.

| 컬럼명 | 타입 | 예시 |
|---|---|---|
| city_id | string | fukuoka_japan |
| budget | number | 4 |
| food | number | 5 |
| shopping | number | 4 |
| nature | number | 3 |
| culture | number | 4 |
| activity | number | 2 |
| relaxed | number | 3 |
| photo | number | 4 |
| local_experience | number | 4 |

### 4. `companion_scores`

동행자 유형별 적합도. 점수는 1~5를 사용한다.

| 컬럼명 | 타입 | 예시 |
|---|---|---|
| city_id | string | fukuoka_japan |
| solo | number | 4 |
| couple | number | 4 |
| friends | number | 5 |
| family | number | 4 |
| parents | number | 3 |

### 5. `climate_by_month`

월별 기후 데이터. 처음에는 핵심 도시부터 채운다.

| 컬럼명 | 타입 | 예시 |
|---|---|---|
| city_id | string | fukuoka_japan |
| month | number | 7 |
| avg_temp_c | number | 28 |
| rainfall_mm | number | 250 |
| climate_note | string | 덥고 습하며 비가 많음 |

## Google Sheets에서 먼저 추가해야 할 컬럼

현재 도시 기본 DB가 있다면 우선순위는 아래 순서다.

### 1순위

- city_id
- min_nights
- ideal_nights
- max_nights
- best_months
- caution_months
- main_airport
- short_intro_ko
- keywords_ko

### 2순위

- flight_cost_min
- flight_cost_max
- hotel_per_night_min
- hotel_per_night_max
- daily_local_cost_min
- daily_local_cost_max

### 3순위

- budget
- food
- shopping
- nature
- culture
- activity
- relaxed
- photo
- local_experience
- solo
- couple
- friends
- family
- parents

## 예상 총비용 계산

MVP 기준 예상 총비용은 아래처럼 단순 계산한다.

```text
estimated_total_cost = flight_cost + hotel_per_night * nights + daily_local_cost * duration_days
```

범위 계산은 min/max를 각각 계산한다.

```text
estimated_min = flight_cost_min + hotel_per_night_min * nights + daily_local_cost_min * duration_days
estimated_max = flight_cost_max + hotel_per_night_max * nights + daily_local_cost_max * duration_days
```

## 데이터 품질 규칙

| 상태 | 의미 |
|---|---|
| draft | 임시 입력 상태 |
| reviewed | 사람이 한 번 검토한 상태 |
| verified | 출처 기반으로 확인된 상태 |

MVP에서는 모든 데이터를 verified로 만들 필요는 없다. 대신 `needs_review`를 통해 결과 화면에서 신뢰도를 낮게 처리할 수 있게 한다.
