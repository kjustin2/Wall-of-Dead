// Survivor traits — a small, readable layer of character + mechanics on rescued
// allies. Each trait changes how that ally fights and gives them a voice, so
// recruiting and losing one actually means something.

export type TraitId = "marksman" | "medic" | "gunner";

export interface Trait {
  id: TraitId;
  label: string;
  blurb: string;
  color: string;
  /** Spoken when recruited / lost — gives the roster a voice. */
  recruitLine: string;
  lostLine: string;
}

export const TRAITS: Record<TraitId, Trait> = {
  marksman: {
    id: "marksman",
    label: "Marksman",
    blurb: "tight groups · +damage",
    color: "#ffd27a",
    recruitLine: "I don't miss. Point me at the dark.",
    lostLine: "had one more shot in them.",
  },
  medic: {
    id: "medic",
    label: "Medic",
    blurb: "patches the line",
    color: "#7dffb0",
    recruitLine: "Stay close — I'll keep you breathing.",
    lostLine: "saved others before the end.",
  },
  gunner: {
    id: "gunner",
    label: "Gunner",
    blurb: "+fire rate",
    color: "#ff8a5a",
    recruitLine: "Let 'em come. I'll hold this lane.",
    lostLine: "went down firing.",
  },
};

export const TRAIT_IDS: TraitId[] = ["marksman", "medic", "gunner"];
