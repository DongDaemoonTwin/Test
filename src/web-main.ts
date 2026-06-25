import "./web-styles.css";

import { sampleDestinations } from "./sample-destinations";
import { scoreDestination } from "./scoring";
import type { CompanionType, Destination, ScoredDestination, StyleTag, UserTripCondition } from "./types";

const styleOptions: Array<{ value: StyleTag; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "food", label: "Food" },
  { value: "shopping", label: "Shopping" },
  { value: "nature", label: "Nature" },
  { value: "culture", label: "Culture" },
  { value: "activity", label: "Activities" },
  { value: "relaxed", label: "Relaxation" },
  { value: "photo", label: "Photo / SNS" },
  { value: "localExperience", label: "Local experience" },
];

const companionLabels: Record<CompanionType, string> = {
  solo: "Solo",
  couple: "Couple",
  friends: "Friends",
  family: "Family",
  parents: "Parents",
};

const destinationCopy: Record<string, { name: string; country: string; intro: string }> = {
  fukuoka_japan: {
    name: "Fukuoka",
    country: "Japan",
    intro: "A compact city for short trips, food, shopping, and easy urban travel.",
  },
  danang_vietnam: {
    name: "Da Nang",
    country: "Vietnam",
    intro: "A beach and resort destination with strong value, but weather and flight prices matter.",
  },
  paris_france: {
    name: "Paris",
    country: "France",
    intro: "A high-impact culture and art destination, but demanding for short trips and lower budgets.",
  },
};

const bucketLabels: Record<ScoredDestination["bucket"], string> = {
  good: "Good fit",
  borderline: "Borderline",
  difficult: "Difficult",
};

const formatKrw = (value: number): string => `KRW ${Math.round(value).toLocaleString("en-US")}`;
const stars = (rating: number): string => "★".repeat(rating) + "☆".repeat(5 - rating);

const splitCommaList = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getDestinationCopy = (destination: Destination): { name: string; country: string; intro: string } =>
  destinationCopy[destination.cityId] ?? {
    name: destination.cityName,
    country: destination.country,
    intro: destination.shortIntroKo,
  };

const buildConditionFromForm = (form: HTMLFormElement): UserTripCondition => {
  const data = new FormData(form);
  const flightTimeRaw = String(data.get("flightTimeToleranceHours") ?? "");

  return {
    departureCity: String(data.get("departureCity")),
    travelMonth: Number(data.get("travelMonth")),
    durationDays: Number(data.get("durationDays")),
    nights: Number(data.get("nights")),
    budgetAmount: Number(data.get("budgetAmount")),
    budgetCurrency: "KRW",
    budgetUnit: "per_person",
    companionType: String(data.get("companionType")) as CompanionType,
    flightTimeToleranceHours: flightTimeRaw === "any" ? null : Number(flightTimeRaw),
    styleTags: data.getAll("styleTags").map(String) as StyleTag[],
    mustHaveConditions: splitCommaList(data.get("mustHaveConditions")),
    avoidConditions: splitCommaList(data.get("avoidConditions")),
  };
};

const buildEnglishReasons = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const reasons: string[] = [];
  const { breakdown, destination } = item;

  if (breakdown.feasibility >= 75) reasons.push("Likely to fit within your budget range.");
  if (breakdown.durationFit >= 80) reasons.push(`Works well for a ${condition.nights}-night itinerary.`);
  if (breakdown.styleFit >= 75) reasons.push("Matches the travel styles you selected.");
  if (breakdown.companionFit >= 75) reasons.push(`Strong fit for ${companionLabels[condition.companionType].toLowerCase()} travel.`);
  if (destination.seasons.bestMonths.includes(condition.travelMonth)) reasons.push("Your travel month is within a recommended season.");

  return reasons.length > 0 ? reasons : [getDestinationCopy(destination).intro];
};

const buildEnglishCautions = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const cautions: string[] = [];
  const { breakdown, destination } = item;

  if (breakdown.feasibility < 75) cautions.push("Flight or hotel prices may push this trip beyond your budget.");
  if (breakdown.durationFit < 60) cautions.push("The trip length may be too short or too long for this destination.");
  if (destination.seasons.cautionMonths.includes(condition.travelMonth)) cautions.push("Your travel month may carry weather or peak-season risks.");
  if (destination.dataQuality.needsReview) cautions.push("Some destination data still needs review before production use.");

  return cautions.length > 0 ? cautions : ["No major caution has been detected in the sample data."];
};

const renderCard = (item: ScoredDestination, condition: UserTripCondition): string => {
  const copy = getDestinationCopy(item.destination);
  const cost = item.estimatedCostRange
    ? `${formatKrw(item.estimatedCostRange[0])} – ${formatKrw(item.estimatedCostRange[1])}`
    : "Cost data needs enrichment";

  return `
    <article class="result-card ${item.bucket}">
      <div class="card-meta">
        <span>${bucketLabels[item.bucket]}</span>
        <strong>${item.score}</strong>
      </div>
      <h3>${copy.name}</h3>
      <p class="destination-line">${copy.country} · ${item.destination.mainAirport}</p>
      <p class="stars" aria-label="${item.starRating} out of 5 stars">${stars(item.starRating)}</p>
      <p class="intro-copy">${copy.intro}</p>
      <div class="cost-band">
        <span>Estimated trip cost</span>
        <strong>${cost}</strong>
      </div>
      <div class="detail-block">
        <h4>Why it fits</h4>
        <ul>${buildEnglishReasons(item, condition).map((reason) => `<li>${reason}</li>`).join("")}</ul>
      </div>
      <div class="detail-block caution-block">
        <h4>Things to watch</h4>
        <ul>${buildEnglishCautions(item, condition).map((caution) => `<li>${caution}</li>`).join("")}</ul>
      </div>
    </article>
  `;
};

const renderResults = (condition: UserTripCondition): void => {
  const results = sampleDestinations
    .map((destination) => scoreDestination(destination, condition))
    .sort((a, b) => b.score - a.score);

  const target = document.querySelector<HTMLElement>("#results");
  if (!target) return;

  target.innerHTML = `
    <div class="results-heading">
      <p class="section-kicker">Recommendation output</p>
      <h2>Your destination shortlist</h2>
      <p>
        ${condition.departureCity} departure · Month ${condition.travelMonth} · ${condition.nights} nights / ${condition.durationDays} days · ${formatKrw(condition.budgetAmount)} per traveler
      </p>
    </div>
    <div class="results-grid">
      ${results.map((item) => renderCard(item, condition)).join("")}
    </div>
  `;
};

const renderApp = (): void => {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  app.innerHTML = `
    <main class="site-shell">
      <nav class="top-nav" aria-label="Main navigation">
        <a class="brand" href="#top" aria-label="Traveling Idea home">Traveling Idea</a>
        <div class="nav-links">
          <a href="#planner">Planner</a>
          <a href="#results">Results</a>
        </div>
      </nav>

      <section class="hero" id="top">
        <div class="hero-copy">
          <p class="eyebrow">Destination decision engine</p>
          <h1>Find the right destination before you book.</h1>
          <p>
            Filter destinations by budget, timing, companions, and travel style — then compare the best options with clear reasons and trade-offs.
          </p>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="mask mask-one"></div>
          <div class="mask mask-two"></div>
          <div class="mask mask-three"></div>
          <span>Budget</span>
          <span>Season</span>
          <span>Fit</span>
        </div>
      </section>

      <section class="planner-panel" id="planner">
        <div class="panel-heading">
          <p class="section-kicker">Trip setup</p>
          <h2>Start with your constraints.</h2>
          <p>No destination is selected by default. Results appear only after you submit your trip conditions.</p>
        </div>

        <form id="trip-form" class="trip-form">
          <label>
            <span>Departure city</span>
            <select name="departureCity" required>
              <option value="" selected disabled>Select departure city</option>
              <option value="ICN">Incheon</option>
              <option value="GMP">Gimpo</option>
              <option value="NRT">Tokyo</option>
              <option value="KIX">Osaka</option>
            </select>
          </label>

          <label>
            <span>Travel month</span>
            <select name="travelMonth" required>
              <option value="" selected disabled>Select month</option>
              ${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}
            </select>
          </label>

          <label>
            <span>Trip duration</span>
            <input name="durationDays" type="number" min="2" max="30" placeholder="4 days" required />
          </label>

          <label>
            <span>Nights</span>
            <input name="nights" type="number" min="1" max="29" placeholder="3 nights" required />
          </label>

          <label>
            <span>Budget per traveler</span>
            <input name="budgetAmount" type="number" min="100000" step="50000" placeholder="800000" required />
          </label>

          <label>
            <span>Companions</span>
            <select name="companionType" required>
              <option value="" selected disabled>Select companion type</option>
              ${Object.entries(companionLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
            </select>
          </label>

          <label>
            <span>Flight time tolerance</span>
            <select name="flightTimeToleranceHours" required>
              <option value="" selected disabled>Select tolerance</option>
              <option value="3">Up to 3 hours</option>
              <option value="6">Up to 6 hours</option>
              <option value="any">No preference</option>
            </select>
          </label>

          <fieldset class="style-selector">
            <legend>Travel style</legend>
            ${styleOptions
              .map(
                (option) => `
                  <label class="style-chip">
                    <input type="checkbox" name="styleTags" value="${option.value}" />
                    <span>${option.label}</span>
                  </label>
                `,
              )
              .join("")}
          </fieldset>

          <label class="wide-field">
            <span>Must-have conditions</span>
            <input name="mustHaveConditions" type="text" placeholder="Beach, shopping, short flight" />
          </label>

          <label class="wide-field">
            <span>Conditions to avoid</span>
            <input name="avoidConditions" type="text" placeholder="Rainy season, long flights, expensive cities" />
          </label>

          <button class="submit-button" type="submit">Generate shortlist</button>
        </form>
      </section>

      <section id="results" class="results-empty" aria-live="polite">
        <p class="section-kicker">No result yet</p>
        <h2>Your shortlist will appear here.</h2>
        <p>Enter your trip conditions above to classify destinations into good fit, borderline, and difficult options.</p>
      </section>
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#trip-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderResults(buildConditionFromForm(form));
  });
};

renderApp();
