# Amadeus Price Integration

## 목적

MVP의 예산 필터를 강화하기 위해 Amadeus API에서 항공권/호텔 가격 샘플을 가져와 `Destination.costProfile`에 반영합니다.

초기 목적은 예약이 아니라 가격 추정입니다.

```text
Amadeus flight/hotel offers
→ price summary
→ CostProfile
→ scoring.ts feasibility
→ good / borderline / difficult bucket
```

## 필요한 환경변수

로컬이나 배포 환경에 아래 값을 설정합니다.

```bash
AMADEUS_CLIENT_ID="your_api_key"
AMADEUS_CLIENT_SECRET="your_api_secret"
AMADEUS_BASE_URL="https://test.api.amadeus.com"
```

운영 전환 시 `AMADEUS_BASE_URL`을 production base URL로 바꿉니다.

## 코드 파일

| 파일 | 역할 |
|---|---|
| `src/amadeus.ts` | OAuth token 발급, 항공/호텔 가격 조회, CostProfile 생성 |
| `src/example-amadeus.ts` | Google Sheets 도시 데이터를 읽고 Amadeus 가격 샘플을 붙이는 예시 |
| `src/types.ts` | CostProfile에 가격 출처/샘플 수/조회 시각 메타데이터 추가 |

## 항공권 평균가 계산

사용 API:

```text
GET /v2/shopping/flight-offers
```

입력값:

- `originLocationCode`: 출발지 IATA 코드. 예: `ICN`
- `destinationLocationCode`: 도착지 IATA 코드. 예: `FUK`
- `departureDate`: 출발일
- `returnDate`: 귀국일
- `adults`: 성인 수
- `currencyCode`: 통화. 예: `KRW`

응답의 `data[].price.grandTotal` 또는 `data[].price.total`을 모아 아래 값을 계산합니다.

- min
- max
- average
- median
- sampleSize

MVP에서는 `flightCostRangeFromICN = [min, max]`로 사용합니다.

## 호텔 평균가 계산

호텔은 2단계입니다.

### 1단계: 도시의 hotelId 목록 조회

```text
GET /v1/reference-data/locations/hotels/by-city
```

입력값:

- `cityCode`: IATA city code. 예: `PAR`, `TYO`, `FUK`
- `radius`
- `ratings`
- `hotelSource=ALL`

### 2단계: hotelId 기준 가격 조회

```text
GET /v3/shopping/hotel-offers
```

입력값:

- `hotelIds`
- `adults`
- `checkInDate`
- `checkOutDate`
- `roomQuantity`
- `currency`

응답의 `offers[].price.total` 또는 `offers[].price.base`를 모아 min/max/average/median을 계산합니다.

중요: Amadeus 호텔 응답 가격은 조회한 날짜 구간의 offer 가격이므로, 추천 엔진의 `hotelPerNightRange`에 넣기 전에 숙박일수로 나눠 1박당 범위로 변환합니다.

```text
hotelPerNightRange = [offerMin / nights, offerMax / nights]
```

## 실행 예시

```bash
npm install
AMADEUS_CLIENT_ID="..." \
AMADEUS_CLIENT_SECRET="..." \
DESTINATION_CITY_ID="fukuoka_japan" \
ORIGIN_LOCATION_CODE="ICN" \
DESTINATION_LOCATION_CODE="FUK" \
HOTEL_CITY_CODE="FUK" \
DEPARTURE_DATE="2026-09-15" \
RETURN_DATE="2026-09-18" \
npm run amadeus:example
```

## 중요한 DB 보강 필요사항

현재 `Cities_Base.main_airport`는 공항 코드입니다.

항공권 검색에는 대체로 쓸 수 있지만, 호텔 검색은 도시 단위 IATA city code가 더 적합합니다.

Google Sheets에 아래 컬럼 또는 탭을 추가하는 것을 권장합니다.

### Cities_Base에 추가 권장

```text
iata_city_code
amadeus_hotel_city_code
```

예:

| city_id | main_airport | iata_city_code | amadeus_hotel_city_code |
|---|---|---|---|
| tokyo_japan | HND | TYO | TYO |
| osaka_japan | KIX | OSA | OSA |
| fukuoka_japan | FUK | FUK | FUK |
| paris_france | CDG | PAR | PAR |

## 주의사항

1. Amadeus 가격은 실시간/캐시/재고 상황에 따라 계속 바뀔 수 있습니다.
2. 추천 결과에는 실시간 가격을 매번 직접 쓰기보다, 일정 주기로 캐시한 가격 범위를 쓰는 편이 안전합니다.
3. 호텔 가격은 방 수(`roomQuantity`)와 투숙 인원에 따라 달라집니다.
4. 항공권 가격은 직항/경유, 수하물, 저비용항공사 커버리지에 따라 실제 체감가와 차이가 날 수 있습니다.
5. MVP에서는 평균가보다 `min~max range + 조회일`을 보여주는 방식이 더 신뢰도가 높습니다.

## 다음 구현 단계

1. Google Sheets에 `iata_city_code` 또는 `amadeus_hotel_city_code` 추가
2. `src/google-sheets.ts`에서 해당 컬럼 읽기
3. `Cost_Profiles` 탭을 만들어 Amadeus 조회 결과를 캐시
4. 추천 점수 계산 시 캐시된 `flightCostRangeFromICN`, `hotelPerNightRange` 사용
5. UI에는 “실시간 가격 아님 / 최근 조회 기준” 문구 표시
