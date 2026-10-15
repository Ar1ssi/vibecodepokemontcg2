import { initializeP2ChatButtons } from './chat-buttons.js';
import { initializeP2BottomButtons } from './bottom-buttons.js';
import { initializeRoomButtons } from './room-buttons.js';
import { initializePublicRoomList } from '../../../../setup/lobby/public-room-list.js';

export const initializeP2Page = () => {
  initializeP2ChatButtons();
  initializeP2BottomButtons();
  initializeRoomButtons();
  initializePublicRoomList();
};
