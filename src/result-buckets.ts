import type { BucketType } from "./types";

export type ResultFilter = "all" | BucketType;

export const bucketTitle: Record<BucketType, string> = {
  good: "Good fit destinations",
  borderline: "Borderline destinations",
  difficult: "Difficult destinations",
};

export const bucketDescription: Record<BucketType, string> = {
  good: "Best matches for the current budget, timing, style, companion, and flight-time setup.",
  borderline: "Possible options with trade-offs. Check what makes them tight before deciding.",
  difficult: "Not ideal for this setup. Kept visible so the user can see why they were pushed down.",
};

export const bucketDefaultLimit: Record<BucketType, number> = {
  good: 9,
  borderline: 6,
  difficult: 6,
};

export const cardLabelsFor = (bucket: BucketType): { primary: string; why: string; watch: string } => {
  if (bucket === "borderline") return { primary: "Almost works", why: "Still good", watch: "Why borderline" };
  if (bucket === "difficult") return { primary: "Not ideal now", why: "Upside", watch: "Why difficult" };
  return { primary: "Recommended", why: "Why", watch: "Watch" };
};
