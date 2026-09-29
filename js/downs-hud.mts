// The rider's instruments at Windrush Downs (planning-docs/FARM_RIDING_PLAN.md):
// the horse's gait, its wind as a bar, its speed, and the WINDED warning; the
// course clock with its faults and the next fence; and a toast for a finish,
// a missed fence or a new best. DOM only — the page hands in the ride state and
// the run, and this draws them.

import { rideGait, type RideProfile, type RideState } from "./farm-ride.mjs";
import { findDownsCourse, formatRunTime, type CourseRun } from "./downs-course.mjs";

type Elements = Readonly<{
  ride: HTMLElement;
  horseName: HTMLElement;
  gait: HTMLElement;
  wind: HTMLElement;
  speed: HTMLElement;
  winded: HTMLElement;
  run: HTMLElement;
  course: HTMLElement;
  time: HTMLElement;
  faults: HTMLElement;
  next: HTMLElement;
  toast: HTMLElement;
}>;

export type DownsHud = Readonly<{
  render: (ride: RideState | null, profile: RideProfile | null, run: CourseRun | null) => void;
  toast: (text: string, detail?: string, seconds?: number) => void;
  setHorse: (name: string) => void;
}>;

const GAIT_WORDS = Object.freeze({ idle: "Standing", walk: "Walk", trot: "Trot", canter: "Canter", gallop: "Gallop" } as const);

export function createDownsHud(elements: Elements): DownsHud {
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = "";
  return Object.freeze({
    setHorse(name) {
      elements.horseName.textContent = name;
    },
    render(ride, profile, run) {
      elements.ride.hidden = !ride || !profile;
      if (ride && profile) {
        const gait = rideGait(ride.speed, profile);
        elements.gait.textContent = ride.airborne ? "Over!" : ride.stumble > 0 ? "Stumbled" : ride.speed < -0.05 ? "Backing" : GAIT_WORDS[gait];
        elements.wind.style.width = `${Math.round((ride.stamina / Math.max(1, profile.staminaMax)) * 100)}%`;
        elements.speed.textContent = String(Math.round(Math.abs(ride.speed) * 3.6));
        elements.winded.hidden = !ride.winded;
        elements.ride.classList.toggle("is-winded", ride.winded);
      }
      const running = run?.phase === "running" ? run : null;
      elements.run.hidden = !running;
      if (!running) {
        lastRun = "";
        return;
      }
      const course = findDownsCourse(running.courseId);
      if (!course) return;
      elements.time.textContent = formatRunTime(running.ticks);
      const key = `${running.courseId}:${running.next}:${running.faults}:${running.missed}`;
      if (key === lastRun) return;
      lastRun = key;
      elements.course.textContent = course.title;
      elements.faults.textContent = `${running.faults} fault${running.faults === 1 ? "" : "s"}`;
      const step = course.steps[running.next];
      const missed = running.missed ? course.steps.find((entry) => (entry.kind === "fence" ? entry.fence.id : entry.line.id) === running.missed) : null;
      elements.next.classList.toggle("is-missed", Boolean(missed));
      elements.next.textContent = missed && missed.kind === "fence"
        ? `Missed fence ${missed.fence.number} — go back for it`
        : step?.kind === "fence" ? `Next: fence ${step.fence.number} of ${course.steps.length}`
        : step ? `Next: ${course.kind === "oval" ? "keep going round" : "checkpoint"}`
        : "Home to the finish!";
    },
    toast(text, detail = "", seconds = 4) {
      elements.toast.replaceChildren(document.createTextNode(text));
      if (detail) {
        const small = document.createElement("small");
        small.textContent = detail;
        elements.toast.append(small);
      }
      elements.toast.hidden = false;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { elements.toast.hidden = true; }, seconds * 1000);
    },
  });
}
