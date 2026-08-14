(function exposeBallCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamBallCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBallCore() {
  const BALLS = [
    {
      name: "Yam Red", archetype: "Balanced", description: "A forgiving all-rounder with familiar timing.",
      a: "#ff3842", b: "#5d0207", hookScale: 1, speedScale: 1, massScale: 1,
      meterSpeed: 1, aimSpeed: 1, chargeSpeed: 1, overchargeGrace: 0.18, overchargeTolerance: 1,
    },
    {
      name: "Blue Bolt", archetype: "Fast", description: "Quick down-lane and quick in your hands; light on impact.",
      a: "#36a7ff", b: "#031e78", hookScale: 0.84, speedScale: 1.12, massScale: 0.92,
      meterSpeed: 1.12, aimSpeed: 1.18, chargeSpeed: 1.24, overchargeGrace: 0.13, overchargeTolerance: 0.9,
    },
    {
      name: "Violet Arc", archetype: "Hook", description: "A deliberate setup with the sharpest late-lane turn.",
      a: "#bd55ff", b: "#33006c", hookScale: 1.35, speedScale: 0.94, massScale: 0.98,
      meterSpeed: 1.16, aimSpeed: 0.82, chargeSpeed: 0.92, overchargeGrace: 0.16, overchargeTolerance: 0.95,
    },
    {
      name: "Green Machine", archetype: "Control", description: "Slow, readable meters make precision shots easier.",
      a: "#53e26f", b: "#054c18", hookScale: 1.08, speedScale: 0.98, massScale: 1,
      meterSpeed: 0.78, aimSpeed: 0.72, chargeSpeed: 0.82, overchargeGrace: 0.29, overchargeTolerance: 1.25,
    },
    {
      name: "Hot Yam", archetype: "Aggressive", description: "Explosive speed and response, with almost no room to overhold.",
      a: "#ffad33", b: "#8d2100", hookScale: 0.94, speedScale: 1.1, massScale: 0.96,
      meterSpeed: 1.22, aimSpeed: 1.25, chargeSpeed: 1.4, overchargeGrace: 0.08, overchargeTolerance: 0.72,
    },
    {
      name: "Golden Spare", archetype: "Precision", description: "Heavy, straight, and patient—the safest ball under pressure.",
      a: "#ffe06b", b: "#815600", hookScale: 0.76, speedScale: 0.94, massScale: 1.14,
      meterSpeed: 0.72, aimSpeed: 0.62, chargeSpeed: 0.68, overchargeGrace: 0.36, overchargeTolerance: 1.4,
    },
    {
      name: "Pearl", archetype: "Smooth", description: "Calm handling, gentle hook, and a generous power window.",
      a: "#f8f8ff", b: "#9aa0b5", hookScale: 1.05, speedScale: 1, massScale: 1.04,
      meterSpeed: 0.86, aimSpeed: 0.82, chargeSpeed: 0.9, overchargeGrace: 0.26, overchargeTolerance: 1.2,
    },
    {
      name: "Midnight", archetype: "Power", description: "Maximum pin drive on a steady, nearly straight line.",
      a: "#343844", b: "#000000", hookScale: 0.7, speedScale: 1.04, massScale: 1.18,
      meterSpeed: 0.96, aimSpeed: 0.68, chargeSpeed: 0.75, overchargeGrace: 0.23, overchargeTolerance: 1.1,
    },
  ];

  function handlingLabel(value) {
    if (value < 0.75) return "Steady";
    if (value < 0.95) return "Controlled";
    if (value <= 1.08) return "Balanced";
    return "Quick";
  }

  function strengthLabel(value) {
    if (value < 0.82) return "Low";
    if (value < 0.97) return "Light";
    if (value <= 1.06) return "Medium";
    if (value <= 1.16) return "Strong";
    return "Max";
  }

  function profileStats(ball) {
    return [
      { label: "Hook", value: strengthLabel(ball.hookScale) },
      { label: "Speed", value: strengthLabel(ball.speedScale) },
      { label: "Impact", value: strengthLabel(ball.massScale) },
      { label: "Aim", value: handlingLabel(ball.aimSpeed) },
      { label: "Spin", value: handlingLabel(ball.meterSpeed) },
      { label: "Charge", value: `${(1.35 / ball.chargeSpeed).toFixed(2)}s` },
    ];
  }

  return { BALLS, profileStats };
});
