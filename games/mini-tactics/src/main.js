import { GameController } from "./game/GameController.js";
import { getUiElements } from "./ui/elements.js";
import { MessageController } from "./ui/messageController.js";

const elements = getUiElements();
const messages = new MessageController(elements.message);
const game = new GameController({
  elements,
  messages
});

game.start();
