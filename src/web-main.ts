import "./web-styles.css";

import { sampleDestinations } from "./sample-destinations";
import { scoreDestination } from "./scoring";
import type { UserTripCondition } from "./types";

const condition: UserTripCondition = {
  departureCity: "ICN",
  travelMonth: 9,
  durationDays: 4,
  nights: 3,
  budgetAmount: 800000,
  budgetCurrency: "KRW",
  budgetUnit: "per_person",
  companionType: "friends",
  flightTimeToleranceHours: 6,
  styleTags: ["budget", "food", "relaxed"],
  mustHaveConditions: ["짧은 비행", "맛집"],
  avoidConditions: ["장거리", "비싼물가"],
};

const formatKrw = (value: number): string => `${Math.round(value / 10000).toLocaleString("ko-KR")}만 원`;
const stars = (rating: number): string => "★".repeat(rating) + "☆".repeat(5 - rating);

const scored = sampleDestinations
  .map((destination) => scoreDestination(destination, condition))
  .sort((a, b) => b.score - a.score);

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Traveling Idea MVP</p>
        <h1>예약 전에, 갈 만한 여행지를 먼저 좁히는 화면</h1>
        <p>Google Sheets나 Amadeus 연결 없이도 localhost에서 볼 수 있는 샘플 프리뷰입니다.</p>
      </section>

      <section class="summary">
        <strong>샘플 조건</strong>
        <span>인천 출발 · 9월 · 3박 4일 · 1인 ${formatKrw(condition.budgetAmount)} · 친구 여행 · 가성비/맛집/휴양</span>
      </section>

      <section class="grid">
        ${scored
          .map((item) => {
            const cost = item.estimatedCostRange
              ? `${formatKrw(item.estimatedCostRange[0])} ~ ${formatKrw(item.estimatedCostRange[1])}`
              : "비용 데이터 보강 필요";

            return `
              <article class="card ${item.bucket}">
                <div class="topline">
                  <span>${item.bucket === "good" ? "갈 만함" : item.bucket === "borderline" ? "애매함" : "어려움"}</span>
                  <b>${item.score}점</b>
                </div>
                <h2>${item.destination.cityName}</h2>
                <p class="meta">${item.destination.country} · ${item.destination.mainAirport}</p>
                <p class="star">${stars(item.starRating)}</p>
                <p>${item.destination.shortIntroKo}</p>
                <p class="cost">예상 비용: ${cost}</p>
                <h3>추천 이유</h3>
                <ul>${item.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>
                <h3>주의점</h3>
                <ul>${(item.cautions.length ? item.cautions : ["특별한 주의점은 아직 없습니다."]).map((caution) => `<li>${caution}</li>`).join("")}</ul>
              </article>
            `;
          })
          .join("")}
      </section>
    </main>
  `;
}
