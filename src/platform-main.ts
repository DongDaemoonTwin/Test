import "./platform-styles.css";

import { sampleDestinations } from "./sample-destinations";
import { scoreDestination } from "./scoring";
import type { CompanionType, ScoredDestination, StyleTag, UserTripCondition } from "./types";

const cityMeta: Record<string, { name: string; country: string; image: string; alt: string; tags: string[] }> = {
  fukuoka_japan: {
    name: "Fukuoka",
    country: "Japan",
    image: "/city-images/fukuoka.svg",
    alt: "Fukuoka city image",
    tags: ["Short flight", "Food", "City break"],
  },
  danang_vietnam: {
    name: "Da Nang",
    country: "Vietnam",
    image: "/city-images/danang.svg",
    alt: "Da Nang beach image",
    tags: ["Beach", "Resort", "Value"],
  },
  paris_france: {
    name: "Paris",
    country: "France",
    image: "/city-images/paris.svg",
    alt: "Paris city image",
    tags: ["Culture", "Shopping", "Long haul"],
  },
};

const styleOptions: Array<{ value: StyleTag; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "food", label: "Food" },
  { value: "shopping", label: "Shopping" },
  { value: "nature", label: "Nature" },
  { value: "culture", label: "Culture" },
  { value: "activity", label: "Activities" },
  { value: "relaxed", label: "Relax" },
  { value: "photo", label: "Photo" },
  { value: "localExperience", label: "Local" },
];

const companionLabels: Record<CompanionType, string> = {
  solo: "Solo",
  couple: "Couple",
  friends: "Friends",
  family: "Family",
  parents: "Parents",
};

const bucketLabel: Record<ScoredDestination["bucket"], string> = {
  good: "Good fit",
  borderline: "Borderline",
  difficult: "Difficult",
};

const formatKrw = (value: number): string => `KRW ${Math.round(value).toLocaleString("en-US")}`;
const stars = (rating: number): string => "★".repeat(rating) + "☆".repeat(5 - rating);

const splitList = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const conditionFromForm = (form: HTMLFormElement): UserTripCondition => {
  const data = new FormData(form);
  const flightTime = String(data.get("flightTimeToleranceHours") ?? "");

  return {
    departureCity: String(data.get("departureCity")),
    travelMonth: Number(data.get("travelMonth")),
    durationDays: Number(data.get("durationDays")),
    nights: Number(data.get("nights")),
    budgetAmount: Number(data.get("budgetAmount")),
    budgetCurrency: "KRW",
    budgetUnit: "per_person",
    companionType: String(data.get("companionType")) as CompanionType,
    flightTimeToleranceHours: flightTime === "any" ? null : Number(flightTime),
    styleTags: data.getAll("styleTags").map(String) as StyleTag[],
    mustHaveConditions: splitList(data.get("mustHaveConditions")),
    avoidConditions: splitList(data.get("avoidConditions")),
  };
};

const reasonsFor = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const reasons: string[] = [];
  if (item.breakdown.feasibility >= 75) reasons.push("Likely to fit your budget.");
  if (item.breakdown.durationFit >= 80) reasons.push(`Works for ${condition.nights} nights.`);
  if (item.breakdown.styleFit >= 75) reasons.push("Matches your selected style.");
  if (item.breakdown.companionFit >= 75) reasons.push(`Good for ${companionLabels[condition.companionType].toLowerCase()} travel.`);
  return reasons.length ? reasons : ["A reasonable destination candidate for this sample setup."];
};

const cautionsFor = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const cautions: string[] = [];
  if (item.breakdown.feasibility < 75) cautions.push("Prices may exceed your budget.");
  if (item.destination.seasons.cautionMonths.includes(condition.travelMonth)) cautions.push("Weather or peak-season risk may apply.");
  if (item.destination.dataQuality.needsReview) cautions.push("Some data still needs review.");
  return cautions.length ? cautions : ["No major caution in the sample data."];
};

const renderCard = (item: ScoredDestination, condition: UserTripCondition): string => {
  const meta = cityMeta[item.destination.cityId] ?? {
    name: item.destination.cityName,
    country: item.destination.country,
    image: item.destination.imageUrls?.card ?? "/city-images/fukuoka.svg",
    alt: item.destination.imageUrls?.alt ?? "Destination image",
    tags: item.destination.keywordsKo.slice(0, 3),
  };
  const cost = item.estimatedCostRange
    ? `${formatKrw(item.estimatedCostRange[0])} - ${formatKrw(item.estimatedCostRange[1])}`
    : "Cost data missing";

  return `
    <article class="destination-card ${item.bucket}">
      <div class="destination-image"><img src="${meta.image}" alt="${meta.alt}" loading="lazy" /><span>${bucketLabel[item.bucket]}</span></div>
      <div class="destination-content">
        <div class="card-head"><div><h3>${meta.name}</h3><p>${meta.country} · ${item.destination.mainAirport}</p></div><div class="score"><strong>${item.score}</strong><small>${stars(item.starRating)}</small></div></div>
        <div class="tag-row">${meta.tags.map((tag) => `<em>${tag}</em>`).join("")}</div>
        <div class="price-row"><span>Estimated total</span><strong>${cost}</strong></div>
        <div class="reason-row"><div><b>Why</b><ul>${reasonsFor(item, condition).map((reason) => `<li>${reason}</li>`).join("")}</ul></div><div><b>Watch</b><ul>${cautionsFor(item, condition).map((caution) => `<li>${caution}</li>`).join("")}</ul></div></div>
        <button type="button">Add to compare</button>
      </div>
    </article>
  `;
};

const renderResults = (condition: UserTripCondition): void => {
  const results = sampleDestinations.map((destination) => scoreDestination(destination, condition)).sort((a, b) => b.score - a.score);
  const target = document.querySelector<HTMLElement>("#results");
  if (!target) return;

  target.className = "results";
  target.innerHTML = `
    <div class="results-head"><div><p class="kicker">Destination results</p><h2>Your best options</h2><p>${condition.departureCity} · Month ${condition.travelMonth} · ${condition.nights} nights · ${formatKrw(condition.budgetAmount)}</p></div></div>
    <div class="cards">${results.map((item) => renderCard(item, condition)).join("")}</div>
  `;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <main>
      <nav class="nav"><strong>Traveling Idea</strong><span>Search</span><span>Compare</span><span>Trips</span></nav>
      <section class="hero">
        <div><p class="kicker">Destination decision platform</p><h1>Find where to go before you book.</h1><p class="lead">Compare destinations by budget, travel month, duration, companions, and style.</p></div>
        <div class="hero-panel"><strong>Travel smarter</strong><p>Start from your real constraints, then compare destination trade-offs before booking.</p></div>
      </section>
      <section class="search-panel" id="planner">
        <form id="trip-form" class="search-form">
          <label><span>From</span><select name="departureCity" required><option value="" selected disabled>Select airport</option><option value="ICN">Seoul Incheon</option><option value="GMP">Seoul Gimpo</option><option value="NRT">Tokyo Narita</option><option value="KIX">Osaka Kansai</option></select></label>
          <label><span>Month</span><select name="travelMonth" required><option value="" selected disabled>Select month</option>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
          <label><span>Days</span><input name="durationDays" type="number" placeholder="4" required /></label>
          <label><span>Nights</span><input name="nights" type="number" placeholder="3" required /></label>
          <label><span>Budget</span><input name="budgetAmount" type="number" placeholder="800000" required /></label>
          <label><span>Companion</span><select name="companionType" required><option value="" selected disabled>Select type</option>${Object.entries(companionLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label><span>Flight time</span><select name="flightTimeToleranceHours" required><option value="" selected disabled>Select tolerance</option><option value="3">Up to 3h</option><option value="6">Up to 6h</option><option value="any">Any</option></select></label>
          <fieldset>${styleOptions.map((option) => `<label><input type="checkbox" name="styleTags" value="${option.value}" /><span>${option.label}</span></label>`).join("")}</fieldset>
          <input name="mustHaveConditions" placeholder="Must-have: beach, shopping, short flight" />
          <input name="avoidConditions" placeholder="Avoid: rainy season, long flights" />
          <button type="submit">Search destinations</button>
        </form>
      </section>
      <section id="results" class="empty"><p class="kicker">No search yet</p><h2>Destination cards will appear here.</h2><p>Submit your trip conditions to see image cards and recommendation reasons.</p></section>
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#trip-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderResults(conditionFromForm(form));
  });
}
