export type SupplyTheme = "outer" | "flood" | "haven";

export interface BossPlan {
  type: string;
  name: string;
  warning: string;
  intro: string;
  at: number;
  warnAt: number;
  z: number;
}

export interface CampaignLevel {
  act: number;
  actName: string;
  levelInAct: number;
  level: number;
  title: string;
  zone: number;
  supplyTheme: SupplyTheme;
  flavor: string;
  radio?: string;
  story: string;
  beat: string;
  boss?: BossPlan;
}

interface ActDef {
  name: string;
  zone: number;
  supplyTheme: SupplyTheme;
  levels: Omit<CampaignLevel, "act" | "actName" | "levelInAct" | "level" | "zone" | "supplyTheme">[];
}

const ACT_DEFS: ActDef[] = [
  {
    name: "THE OUTER ROAD",
    zone: 1,
    supplyTheme: "outer",
    levels: [
      {
        title: "MILE MARKER",
        flavor: "First barricade, first night. Hold until dawn.",
        story:
          "The convoy leaves the highway shoulder and crawls through wrecked suburbs. This first barricade is crude, but it buys distance from the open road.",
        beat: "Convoy: 'Checkpoint one held. Two more stands before the refinery belt.'",
      },
      {
        title: "UNDERPASS",
        flavor: "The road narrows under concrete. Do not let them stack up.",
        radio: "Convoy: 'Headlights off. The underpass is full of echoes.'",
        story:
          "The next stop is a sunken underpass packed with stalled cars. Noise bounces under the concrete, and every shot seems to answer itself.",
        beat: "Convoy: 'Underpass is clear enough. The refinery lights are ahead.'",
      },
      {
        title: "REFINERY YARD",
        flavor: "End of Act I. Something heavy is moving through the wrecks.",
        radio: "Convoy: 'Fuel tanks ahead. If that yard goes up, so do we.'",
        story:
          "The refinery yard is the last outer-road hold. Rusted pipes and tanker shadows cut the field into lanes, and a roadblock corpse drags a slab of engine steel behind it.",
        beat: "Convoy: 'The Roadblock is down. We are through the outer road.'",
        boss: {
          type: "roadblock",
          name: "THE ROADBLOCK",
          warning: "A dead giant is tearing cars apart for armor.",
          intro: "Break its plates before it breaks the wall.",
          warnAt: 0.38,
          at: 0.5,
          z: -42,
        },
      },
    ],
  },
  {
    name: "THE FLOODLINE",
    zone: 2,
    supplyTheme: "flood",
    levels: [
      {
        title: "LOW WATER",
        flavor: "Black water in the field. Watch for crawlers.",
        radio: "Convoy: 'Road drops from here. Keep to high ground if you can find it.'",
        story:
          "Past the refinery the road sinks into drowned blocks. Water hides curbs, bodies, and anything low enough to crawl.",
        beat: "Convoy: 'We found the ridge road. Water keeps rising behind us.'",
      },
      {
        title: "PUMP STATION",
        flavor: "Pumps are dead. The dead are not.",
        radio: "Mara: 'The station's dry inside. Outside is another story.'",
        story:
          "A pump station gives the convoy one raised platform and no comfort. Every generator cough echoes across the flooded lots.",
        beat: "Convoy: 'Station is behind us. One more flooded holdout before dry ground.'",
      },
      {
        title: "DROWNED SPAN",
        flavor: "End of Act II. The bridge itself is moving.",
        radio: "Convoy: 'Bridge is half under. Something is coming up with it.'",
        story:
          "At the drowned span, the road surfaces one last time. A swollen titan rises from under the bridge and brings the floodline with it.",
        beat: "Convoy: 'The Drowned Titan sank. We are past the water.'",
        boss: {
          type: "drowned",
          name: "THE DROWNED TITAN",
          warning: "The water is heaving around one huge shape.",
          intro: "Keep it away from the wall or the flood follows.",
          warnAt: 0.36,
          at: 0.48,
          z: -44,
        },
      },
    ],
  },
  {
    name: "HAVEN APPROACH",
    zone: 3,
    supplyTheme: "haven",
    levels: [
      {
        title: "ASH APPROACH",
        flavor: "Haven's floodlights are visible through the ash.",
        radio: "Haven Control: 'Proceed to outer checkpoint. No guarantees beyond that.'",
        story:
          "Dry ground returns as ash. Haven's lights cut the horizon, sterile and cold, while the convoy moves through streets that burned for weeks.",
        beat: "Convoy: 'Haven heard us. They are watching now.'",
      },
      {
        title: "SCREENING LINE",
        flavor: "The safe zone tests everyone at the wall.",
        radio: "Haven Control: 'Hold the screening line. Entry depends on compliance.'",
        story:
          "Haven's outer screening line is all fences, floodlights, and orders. Their guns point outward, but not only outward.",
        beat: "Haven Control: 'Screening line held. Final gate opens at dawn if you earn it.'",
      },
      {
        title: "HAVEN'S GATE",
        flavor: "Final act. Hold the gate until first light.",
        radio: "Haven Control: 'Last gate. No breach, no exceptions.'",
        story:
          "The final rampart is real concrete under real floodlights. The crowd outside is desperate, the guards inside are quiet, and the biggest thing on the road has followed you here.",
        beat: "Haven Control: 'Gate is intact. Terms will be discussed.'",
        boss: {
          type: "behemoth",
          name: "THE BEHEMOTH",
          warning: "The ground trembles all the way through the concrete.",
          intro: "The road's last corpse has reached Haven.",
          warnAt: 0.34,
          at: 0.46,
          z: -44,
        },
      },
    ],
  },
];

export const CAMPAIGN: CampaignLevel[] = ACT_DEFS.flatMap((act, ai) =>
  act.levels.map((level, li) => ({
    ...level,
    act: ai + 1,
    actName: act.name,
    levelInAct: li + 1,
    level: ai * act.levels.length + li + 1,
    zone: act.zone,
    supplyTheme: act.supplyTheme,
  }))
);

export const ACT_COUNT = ACT_DEFS.length;
export const LEVELS_PER_ACT = ACT_DEFS[0]?.levels.length ?? 1;
export const TOTAL_LEVELS = CAMPAIGN.length;

export function levelInfo(level: number): CampaignLevel {
  const idx = Math.max(0, Math.min(CAMPAIGN.length - 1, Math.floor(level) - 1));
  return CAMPAIGN[idx];
}

export function nextLevelInfo(level: number): CampaignLevel {
  return levelInfo(Math.min(TOTAL_LEVELS, level + 1));
}

export function actLevelLabel(level: number): string {
  const info = levelInfo(level);
  return `LEVEL ${info.act}-${info.levelInAct}`;
}

export function campaignNodeLabels(): string[] {
  const labels = ["START"];
  for (const level of CAMPAIGN) labels.push(`${level.act}-${level.levelInAct}`);
  return labels;
}

export function bossTypeKeys(): string[] {
  return CAMPAIGN.map((level) => level.boss?.type).filter((type): type is string => !!type);
}
