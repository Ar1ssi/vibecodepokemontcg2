// The server pushes views only in response to commands, so a player who
// reloads and rejoins a running server-authoritative game sees nothing
// server-owned (the Stadium above all, which no legacy replay rebuilds)
// until someone acts. A seated rejoin pulls the current view instead.
export const shouldRequestViewOnJoin = (joinData) =>
  Boolean(joinData?.serverAuthoritative && joinData?.rejoinedGame);

// Design 069: a view stamped with another room's id (one still in flight when this client left,
// or sent before the server learned it left) must never reach the board. Unstamped views pass.
export const isViewForRoom = (viewData, roomId) =>
  viewData?.gameId == null || viewData.gameId === roomId;
