// What a player can ask the Suggest tab for (design 069, Options 9-10). Every id except `budget`
// is a tag baked onto dataset cards by scripts/limitless/card-tags.mjs; `budget` reads prices.
export const GOALS = [
  { id: 'setup', label: 'Faster setup', blurb: 'Get Pokémon onto the Bench and evolved sooner' },
  { id: 'draw', label: 'Draw & search', blurb: 'Draw more cards and find the ones you need' },
  { id: 'disruption', label: 'Disruption', blurb: "Mess with your opponent's hand, Energy and Active" },
  { id: 'acceleration', label: 'Energy acceleration', blurb: 'Attach more than one Energy a turn' },
  { id: 'recovery', label: 'Recovery & healing', blurb: 'Get cards back from the discard pile, heal damage' },
  { id: 'mobility', label: 'Switching', blurb: 'Swap your Active Pokémon and retreat for less' },
  { id: 'budget', label: 'Budget', blurb: 'Cheap cards that lists like yours play' },
];

export const GOAL_IDS = GOALS.map((goal) => goal.id);
export const BUDGET_GOAL = 'budget';
export const BUDGET_MAX_USD = 1;

export function goalLabel(id) {
  return GOALS.find((goal) => goal.id === id)?.label || id;
}
