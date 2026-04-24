import { initSessionNav } from "./arcade-session-nav.mjs";

initSessionNav(document.getElementById("homeAuthNav"), {
  signInPath: "sign-in/index.html",
  signUpPath: "sign-up/index.html",
  homeOnLogout: "index.html",
});

const links = Array.from(document.querySelectorAll(".mode-link, .hero-cta"));
let selectedIndex = 0;

function setSelectedIndex(index) {
  if (!links.length) return;

  selectedIndex = ((index % links.length) + links.length) % links.length;

  links.forEach((link, currentIndex) => {
    link.classList.toggle("gamepad-selected", currentIndex === selectedIndex);
  });
}

links.forEach((link, index) => {
  link.addEventListener("mouseenter", () => {
    setSelectedIndex(index);
  });
});

window.ArcadeInput?.onAction((action) => {
  if (action === "left" || action === "up") {
    setSelectedIndex(selectedIndex - 1);
  }

  if (action === "right" || action === "down") {
    setSelectedIndex(selectedIndex + 1);
  }

  if (action === "select") {
    links[selectedIndex]?.click();
  }
});

setSelectedIndex(0);
