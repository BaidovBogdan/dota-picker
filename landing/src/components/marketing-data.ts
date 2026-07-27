export type HeroRef = {
  name: string;
  slug: string;
};

export type DraftScenario = {
  title: string;
  role: string;
  situation: string;
  enemies: HeroRef[];
  recommendations: Array<
    HeroRef & {
      reason: string;
      risk: string;
      score: number;
    }
  >;
};

export const draftEnemies: HeroRef[] = [
  { name: "Axe", slug: "axe" },
  { name: "Pudge", slug: "pudge" },
  { name: "Phantom Assassin", slug: "phantom_assassin" },
  { name: "Puck", slug: "puck" },
  { name: "Disruptor", slug: "disruptor" }
];

export const draftRecommendations = [
  {
    name: "Viper",
    slug: "viper",
    reason: "Punishes the melee front line and keeps your mid timing intact.",
    risk: "Low mobility if the lane collapses early.",
    score: 94
  },
  {
    name: "Puck",
    slug: "puck",
    reason: "Adds initiation and a safer way through layered control.",
    risk: "Needs clean spell usage to convert the matchup.",
    score: 89
  },
  {
    name: "Lina",
    slug: "lina",
    reason: "Creates range, lane pressure, and a different damage angle.",
    risk: "More vulnerable when the fight reaches the back line.",
    score: 84
  }
];

export const scenarios: DraftScenario[] = [
  {
    title: "Break their front line",
    role: "Mid",
    situation: "Axe and Pudge want every fight to happen on top of you.",
    enemies: [
      { name: "Axe", slug: "axe" },
      { name: "Pudge", slug: "pudge" },
      { name: "Phantom Assassin", slug: "phantom_assassin" }
    ],
    recommendations: draftRecommendations
  },
  {
    title: "Play through control",
    role: "Carry",
    situation: "Disruptor and Puck turn one bad step into a lost fight.",
    enemies: [
      { name: "Disruptor", slug: "disruptor" },
      { name: "Puck", slug: "puck" },
      { name: "Axe", slug: "axe" }
    ],
    recommendations: [
      {
        name: "Juggernaut",
        slug: "juggernaut",
        reason: "Keeps a stable carry curve while giving you a clean magic answer.",
        risk: "Spin timing decides whether the pick feels safe.",
        score: 92
      },
      {
        name: "Sven",
        slug: "sven",
        reason: "Builds a durable front-to-back plan with reliable farm recovery.",
        risk: "Can be kited after committing.",
        score: 86
      },
      {
        name: "Anti-Mage",
        slug: "antimage",
        reason: "Turns their spell-heavy control into a late-game opening.",
        risk: "The draft must survive your slower timing.",
        score: 81
      }
    ]
  },
  {
    title: "Finish the teamfight",
    role: "Hard Support",
    situation: "Your cores have damage. The draft still needs a way to hold targets.",
    enemies: [
      { name: "Phantom Assassin", slug: "phantom_assassin" },
      { name: "Pudge", slug: "pudge" },
      { name: "Viper", slug: "viper" }
    ],
    recommendations: [
      {
        name: "Shadow Shaman",
        slug: "shadow_shaman",
        reason: "Adds the reliable control and objective pressure your cores are missing.",
        risk: "Positioning is unforgiving against jump.",
        score: 91
      },
      {
        name: "Crystal Maiden",
        slug: "crystal_maiden",
        reason: "Supports the lane and gives the lineup layered control.",
        risk: "Needs protection to channel impact in fights.",
        score: 85
      },
      {
        name: "Disruptor",
        slug: "disruptor",
        reason: "Punishes overextension and completes the catch sequence.",
        risk: "Less direct tower pressure.",
        score: 82
      }
    ]
  }
];

export const scoringSignals = [
  { label: "Matchup evidence", value: 94 },
  { label: "Role fit", value: 89 },
  { label: "Current meta", value: 83 },
  { label: "Team need", value: 76 },
  { label: "Sample reliability", value: 71 }
];

export const faqItems = [
  {
    question: "Do I need to upload screenshots or enter heroes?",
    answer:
      "No. The Windows app is designed to detect the live draft automatically and bring the recommendation overlay into the game. You launch Counterpick, then keep playing normally."
  },
  {
    question: "Why does Counterpick show three picks instead of one?",
    answer:
      "A draft is a decision, not a command. Counterpick ranks three defensible options, explains the lead choice, and keeps the trade-offs visible so you stay in control."
  },
  {
    question: "What shapes the ranking?",
    answer:
      "Matchup evidence, your selected role, current role meta, team needs, and sample reliability build the candidate pool. AI can help separate close options, but it does not replace the underlying evidence."
  },
  {
    question: "What is included in Free and Pro?",
    answer:
      "Free starts with three draft analyses and returns one every 24 hours, up to three. Pro supports up to 100 analyses every 24 hours. Monthly and annual pricing will be localized at launch."
  },
  {
    question: "What will be confirmed before the Windows release?",
    answer:
      "Supported Windows versions and display modes, detection details, data handling, installer size, and measured performance impact will be published with the release build. This page does not invent those claims before testing."
  }
];
