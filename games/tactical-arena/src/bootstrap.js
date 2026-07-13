import { composePage } from "./ui/pageComposer.js";

async function bootstrap() {
  await composePage();
  await import("./main.js");
}

bootstrap().catch((error) => {
  console.error("Tactical Arena failed to start.", error);
  const message = document.createElement("p");
  message.className = "boot-error";
  message.setAttribute("role", "alert");
  message.textContent = "Tactical Arena could not load. Refresh the page to try again.";
  document.body.append(message);
});

