# 다음 개발 단계

## 현재 완료된 것

- MVP 기준선 문서화
- Google Sheets 탭/컬럼 설계
- `UserTripCondition` 타입 정의
- `Destination` 타입 정의
- 1차 점수 계산 함수 작성
- 결과 버킷 분류 기준 작성
- 샘플 도시 데이터 작성
- Google Sheets 행 정규화 함수 작성

## 다음에 할 일

### 1. 실제 Google Sheets 컬럼 정리

`docs/database-schema.md` 기준으로 기존 도시 DB에 없는 컬럼을 추가한다.

우선 추가할 컬럼:

- city_id
- min_nights
- ideal_nights
- max_nights
- best_months
- caution_months
- main_airport
- short_intro_ko
- keywords_ko
- flight_cost_min
- flight_cost_max
- hotel_per_night_min
- hotel_per_night_max
- daily_local_cost_min
- daily_local_cost_max
- style score 컬럼 9개
- companion score 컬럼 5개

### 2. 샘플 도시 20개만 먼저 채우기

처음부터 300개 도시를 다 정리하지 않는다.

추천 샘플:

- 후쿠오카
- 오사카
- 도쿄
- 삿포로
- 타이베이
- 홍콩
- 방콕
- 다낭
- 호치민
- 하노이
- 세부
- 싱가포르
- 발리
- 괌
- 사이판
- 파리
- 로마
- 런던
- 바르셀로나
- 프라하

이 20개로 추천 결과가 납득되는지 먼저 테스트한다.

### 3. 입력 폼 만들기

첫 화면 `/`에서 아래 값을 받는다.

- 출발지
- 여행 월
- 여행 기간
- 예산
- 예산 단위
- 동행자
- 비행시간 허용
- 여행 스타일
- 꼭 원하는 조건
- 피하고 싶은 조건

### 4. 결과 페이지 만들기

`/results`에서 `scoreDestinations()` 결과를 보여준다.

표시 형식:

```text
후쿠오카 ★★★★☆
갈 만한 여행지
예상 비용: 67만~112만 원
이유: 짧은 일정에 적합하고 음식·쇼핑 선호와 잘 맞습니다.
주의: 성수기에는 항공권 가격이 올라갈 수 있습니다.
```

### 5. 비교 페이지 만들기

`/compare`에서는 선택한 2~5개 도시를 표로 비교한다.

비교 항목:

- 예상 비용
- 추천도
- 비행시간
- 추천 숙박일수
- 시즌 적합도
- 스타일 적합도
- 동행자 적합도
- 주의점

## 당장 하지 않을 것

- 실시간 항공권 API
- 실시간 호텔 API
- 커뮤니티
- 리뷰 시스템
- 로그인
- 결제
- 복잡한 AI 추천 엔진

이 기능들은 MVP 반응을 본 뒤에 붙인다.

## MVP 성공 기준

초기에는 정확한 점수보다 사용자가 의사결정에 도움을 받았는지를 본다.

확인할 지표:

- 추천 결과를 끝까지 보는가?
- 후보 도시를 2~5개로 줄이는가?
- 결과를 저장하거나 공유하고 싶어 하는가?
- 왜 추천됐는지 납득하는가?
- 피드백에서 “이런 비교가 필요했다”는 반응이 나오는가?
