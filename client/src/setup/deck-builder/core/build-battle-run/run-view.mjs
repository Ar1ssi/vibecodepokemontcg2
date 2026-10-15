// What the Build & Battle run screens say (design 071). The English is TCG Live's own
// (loc_en.json `rain_bnb_*`), reworded only where it promises rewards or Event Tokens, which this
// mode does not have.

export const RUN_TEXT = {
  title: 'Build & Battle Mode',
  carousel: [
    'Build a deck with a Build & Battle Box.',
    'Battle against other Trainers.',
    'Play every match to finish your run.',
  ],
  startButton: 'Start run',
  startConfirm: "Are you sure you'd like to begin Build & Battle Mode?",
  modeInfo: [
    'Welcome to Build & Battle Mode! When you start a Build & Battle run, you begin with a limited number of cards to build a deck. Play all of your matches to finish the run.',
    "You may edit your deck as much as you'd like between matches. Your progress is also saved after each match, so you may exit Build & Battle Mode at any time and return later to resume your run.",
  ],
  deckInvalid: 'The deck you are editing is not valid for play in Build & Battle Mode.',
  forfeitButton: 'Forfeit',
  forfeitConfirm:
    'You may forfeit your run at any point. You will not be able to play any more matches in it. You may begin a new run from the Build & Battle Mode screen.',
  runComplete: 'Run complete',
  runForfeited: 'Run forfeited',
  doneButton: 'Done',
  playButton: 'Play',
  editDeckButton: 'Edit Deck',
  modeInfoButton: 'Mode Info',
  manualResultSummary: "Result didn't come through?",
  manualWin: 'Record a win',
  manualLoss: 'Record a loss',
};

/** @returns {string} TCG Live's `{0}/{1} Matches` meter text for the matches played so far. */
export function progressLabel({ played, total }) {
  return `${played}/${total} Matches`;
}

/** @returns {string} one line of the run summary. */
export function matchResultLine(index, won) {
  return `Match ${index + 1}: ${won ? 'Victory' : 'Defeat'}`;
}

/** @returns {string} the run summary's headline. */
export function summaryHeadline({ wins, losses, endedEarly }) {
  const record = `${wins}–${losses}`;
  return `${endedEarly ? RUN_TEXT.runForfeited : RUN_TEXT.runComplete} · ${record}`;
}
