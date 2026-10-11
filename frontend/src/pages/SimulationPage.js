import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, updateDoc, getDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";


// GEOMETRY
const W = 1000, H = 1000, CX = 500, CY = 500, L = 26;
// Width of the incoming road section (3 lanes) & Width of the outgoing road section (2 lanes)
const EW = 3 * L, XW = 2 * L;
const IX1 = CX - EW, IX2 = CX + EW, IY1 = CY - EW, IY2 = CY + EW, IW = IX2 - IX1;
const NLX = [CX + L / 2, CX + 3 * L / 2, CX + 5 * L / 2];
const SLX = [CX - L / 2, CX - 3 * L / 2, CX - 5 * L / 2];
const ELY = [CY + L / 2, CY + 3 * L / 2, CY + 5 * L / 2];
const WLY = [CY - L / 2, CY - 3 * L / 2, CY - 5 * L / 2];
const NEX = [CX - L / 2, CX - 3 * L / 2, CX - 5 * L / 2];
const SEX = [CX + L / 2, CX + 3 * L / 2, CX + 5 * L / 2];
const EEY = [CY - L / 2, CY - 3 * L / 2, CY - 5 * L / 2];
const WEY = [CY + L / 2, CY + 3 * L / 2, CY + 5 * L / 2];

// ─── SPEED of cars
const SPD = 0.9, CW = 10, CH = 16, GAP = 26;
const SESSION_LIMIT = 240;
// Color palette used for vehicle rendering
const CLRS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c", "#e91e63", "#00b4d8", "#ff6b35"];
const NAMES = { N: "North", S: "South", E: "East", W: "West" };
const DIR_CLR = { N: "#3a8fff", S: "#ff6040", E: "#f1c40f", W: "#2ecc71" };
let uid = 0;

// ═══════════════════════════════════════════════════════════════════════════
// AI ENGINE - fallback
// ═══════════════════════════════════════════════════════════════════════════
function computeAI(counts, amb) {
  const dirs = ["N", "S", "E", "W"];
  const pri = amb ? amb.lane : dirs.reduce((b, d) => counts[d] > counts[b] ? d : b, "N");
  // Stores congestion percentage for each direction
  const cong = {};
  for (const d of dirs) cong[d] = Math.min(99, Math.round((counts[d] / 30) * 100));
  // Stores the suggested green signal duration
  let dur;
  // Give ambulance priority with a fixed green duration
  if (amb) { dur = 35; }
  else {
    // Number of vehicles in the selected priority direction
    const mc = counts[pri];
    // Low traffic: assign a short green duration
    if (mc < 3) dur = Math.round(18 + mc * 3.2);
    else if (mc < 6) dur = Math.round(28 + (mc - 3) * 4.2);
    else if (mc < 9) dur = Math.round(40 + (mc - 6) * 4.5);
    else if (mc < 12) dur = Math.round(53 + (mc - 9) * 3.8);
    else dur = Math.round(64 + (mc - 12) * 2.5);
  }
  // Keep duration within a safe range between 15 and 75 seconds
  dur = Math.min(75, Math.max(15, dur));
  // Calculate average congestion across all four directions
  const avg = Math.round(Object.values(cong).reduce((a, b) => a + b, 0) / 4);
  // Return the AI recommendation and congestion summary
  return {
    lane: pri, name: NAMES[pri], dur, cong, avg,
    congested: avg > 45
  };
}
// CAR PATHS 
// Builds the route points for each vehicle.
// The route depends on:
// 1. Approach direction: North, South, East, or West
// 2. Lane number: left, middle, or right
// 3. Allowed lane movement: left turn, straight, or right turn
// The returned array contains points that the car follows step by step.
function mkPath(ap, ln) {
  const rnd = () => Math.random() < 0.5;
  if (ap === "N") {
    // Get the x-position of the selected north lane
    const x = NLX[ln];
    if (ln === 0) return [{ x, y: -22 }, { x, y: IY1, w: 1 }, { x, y: CY }, { x: IX1, y: WEY[0] }, { x: -22, y: WEY[0] }];
    if (ln === 1) return [{ x, y: -22 }, { x, y: IY1, w: 1 }, { x, y: IY2 }, { x, y: H + 22 }];
    // North right lane: randomly choose between right turn and straight movement
    return rnd() ? [{ x, y: -22 }, { x, y: IY1, w: 1 }, { x, y: CY }, { x: IX2, y: EEY[0] }, { x: W + 22, y: EEY[0] }]
      : [{ x, y: -22 }, { x, y: IY1, w: 1 }, { x, y: IY2 }, { x, y: H + 22 }];
  }
  if (ap === "S") {
    const x = SLX[ln];
    if (ln === 0) return rnd() ? [{ x, y: H + 22 }, { x, y: IY2, w: 1 }, { x, y: CY }, { x: IX2, y: EEY[0] }, { x: W + 22, y: EEY[0] }]
      : [{ x, y: H + 22 }, { x, y: IY2, w: 1 }, { x, y: IY1 }, { x, y: -22 }];
    if (ln === 1) return [{ x, y: H + 22 }, { x, y: IY2, w: 1 }, { x, y: IY1 }, { x, y: -22 }];
    return [{ x, y: H + 22 }, { x, y: IY2, w: 1 }, { x, y: CY }, { x: IX1, y: WEY[0] }, { x: -22, y: WEY[0] }];
  }
  if (ap === "E") {
    // East approach: get the y-position of the selected east lane
    const y = ELY[ln];
    if (ln === 0) return rnd() ? [{ x: W + 22, y }, { x: IX2, y, w: 1 }, { x: CX, y }, { x: NEX[0], y: IY1 }, { x: NEX[0], y: -22 }]
      : [{ x: W + 22, y }, { x: IX2, y, w: 1 }, { x: IX1, y }, { x: -22, y }];
    if (ln === 1) return [{ x: W + 22, y }, { x: IX2, y, w: 1 }, { x: IX1, y }, { x: -22, y }];
    return [{ x: W + 22, y }, { x: IX2, y, w: 1 }, { x: CX, y }, { x: SEX[0], y: IY2 }, { x: SEX[0], y: H + 22 }];
  }
  const y = WLY[ln];
  if (ln === 0) return rnd() ? [{ x: -22, y }, { x: IX1, y, w: 1 }, { x: CX, y }, { x: SEX[0], y: IY2 }, { x: SEX[0], y: H + 22 }]
    : [{ x: -22, y }, { x: IX1, y, w: 1 }, { x: IX2, y }, { x: W + 22, y }];
  if (ln === 1) return [{ x: -22, y }, { x: IX1, y, w: 1 }, { x: IX2, y }, { x: W + 22, y }];
  return [{ x: -22, y }, { x: IX1, y, w: 1 }, { x: CX, y }, { x: NEX[0], y: IY1 }, { x: NEX[0], y: -22 }];
}

// CAR SPAWN
function doSpawn(sim, ap, ln) {
  const path = mkPath(ap, ln),
    // Starting point of the generated path
    s = path[0];
  // Check existing vehicles before spawning a new one
  for (const c of sim.cars)
    // x,y Current vehicle position
    if (c.ap === ap && c.ln === ln && !c.done && Math.hypot(c.x - s.x, c.y - s.y) < 68) return;
  sim.cars.push({
    id: uid++, ap, ln, path, pi: 0, x: s.x, y: s.y,
    // Initial vehicle rotation angle based on approach direction
    ang: { N: Math.PI / 2, S: -Math.PI / 2, E: Math.PI, W: 0 }[ap],
    color: CLRS[uid % CLRS.length], speed: SPD, isAmbulance: false, waiting: false, done: false
  });
}

// Spawn the ambulance emergency vehicle
function spawnAmbulanceCar(sim) {
  const ap = sim.ambulance.lane;
  // Only one ambulance car at a time
  if (sim.cars.some(c => c.isAmbulance && !c.done)) return;
  const ln = 1; // always middle-lane straight through
  const path = mkPath(ap, ln);
  const s = path[0];
  sim.cars.push({
    id: uid++, ap, ln, path, pi: 0, x: s.x, y: s.y,
    ang: { N: Math.PI / 2, S: -Math.PI / 2, E: Math.PI, W: 0 }[ap],
    color: "#f5f5f0", speed: SPD * 2.5, isAmbulance: true, waiting: false, done: false
  });
}

// CAR PHYSICS
// Calculates the distance to the nearest vehicle ahead in the same lane
function fwdDist(car, cars) {
  // After passing the waiting area, ignore queue spacing checks
  if (car.pi > 1) return Infinity; let m = Infinity;
  for (const c of cars) {
    // Skip the same car and vehicles that already left the simulation
    // Only compare vehicles in the same approach and same lane
    if (c === car || c.done || c.pi > 1 || c.ap !== car.ap || c.ln !== car.ln) continue;
    let ah = false;
    if (car.ap === "N") ah = c.y >= car.y - 2; if (car.ap === "S") ah = c.y <= car.y + 2;
    if (car.ap === "E") ah = c.x <= car.x + 2; if (car.ap === "W") ah = c.x >= car.x - 2;
    if (ah) { const d = Math.hypot(c.x - car.x, c.y - car.y); if (d > 1) m = Math.min(m, d); }
  } return m;
}
// Moves one vehicle along its path for the current animation frame
function stepCar(car, dt, sim) {
  if (car.done) return;
  // Calculate movement distance based on vehicle speed and frame time
  const step = ((car.speed || SPD) / 16.67) * dt;
  const ni = car.pi + 1;
  if (ni >= car.path.length) { car.done = true; return; }
  const tgt = car.path[ni];
  const dx = tgt.x - car.x, dy = tgt.y - car.y, d = Math.hypot(dx, dy);
  if (d > 0.5) car.ang = Math.atan2(dy, dx);
  // Move the vehicle toward the target point without overshooting it
  const mv = (s) => { if (d <= s) { car.x = tgt.x; car.y = tgt.y; car.pi = ni; } else { car.x += (dx / d) * s; car.y += (dy / d) * s; } };

  // ── Ambulance: priority but NO overlapping ──
  if (car.isAmbulance) {


    if (tgt.w) {
      if (d <= 1) {
        car.x = tgt.x;
        car.y = tgt.y;

        const go =
          !sim.transitioning &&
          car.ap === sim.activeLane;

        if (go) {
          car.waiting = false;
          car.pi = ni;
        } else {
          car.waiting = true;
        }

        return;
      }


      const ad = fwdDist(car, sim.cars);
      const s = Math.min(step, Math.max(0, ad - GAP));

      if (s <= 0.01) {
        car.waiting = true;
        return;
      }

      car.waiting = false;
      mv(s);
      return;
    }


    car.waiting = false;
    mv(step * 1.8);
    return;
  }

  // ── Regular cars ──
  if (tgt.w) {
    if (d <= 1) {
      car.x = tgt.x; car.y = tgt.y;
      // Ambulance can move only when its lane is the active green lane
      const go = !sim.transitioning && car.ap === sim.activeLane;
      if (go) { car.waiting = false; car.pi = ni; } else car.waiting = true;
      return;
    }
    const ad = fwdDist(car, sim.cars);
    const s = Math.min(step, Math.max(0, ad - GAP));
    if (s <= 0.01) { car.waiting = true; return; }
    car.waiting = false; mv(s);
  } else { car.waiting = false; mv(step); }
}


// CANVAS DRAWING

const ln = (ctx, x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function drawRoads(ctx) {
  ctx.fillStyle = "#595959";
  ctx.fillRect(IX1, IY1, IW, IW);                        // ← intersection box (center)
  ctx.fillRect(CX - XW - L, 0, XW + EW + L, IY1);               // North arm
  ctx.fillRect(CX - EW, IY2, EW + XW + L, H - IY2);             // South arm
  ctx.fillRect(IX2, CY - XW - L, W - IX2, XW + EW + L);           // East arm
  ctx.fillRect(0, CY - EW, IX1, EW + XW + L);                  // West arm
}

function drawHeat(ctx, cong, gf) {
  const R = { N: [CX, 0, EW, IY1], S: [IX1, IY2, EW, H - IY2], E: [IX2, CY, W - IX2, EW], W: [0, IY1, IX1, EW] };
  for (const [d, r] of Object.entries(R)) {
    const c = cong[d], g = gf[d]; let col = null;
    if (g > 0 && c < 0.3) col = `rgba(40,218,110,${(g / 1500) * 0.52})`;
    else if (c > 0.75) col = `rgba(215,38,38,${0.22 + c * 0.32})`;
    else if (c > 0.40) col = `rgba(228,138,18,${0.08 + (c - 0.28) * 0.55})`;
    if (col) { ctx.fillStyle = col; ctx.fillRect(...r); }
  }
}

function drawMarkings(ctx) {
  ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.72)";
  // Outer road edges
  ln(ctx, CX - XW - L, 0, CX - XW - L, IY1); ln(ctx, IX2, 0, IX2, IY1);
  ln(ctx, IX1, IY2, IX1, H); ln(ctx, CX + XW + L, IY2, CX + XW + L, H);
  ln(ctx, IX2, CY - XW - L, W, CY - XW - L); ln(ctx, IX2, IY2, W, IY2);
  ln(ctx, 0, IY1, IX1, IY1); ln(ctx, 0, CY + XW + L, IX1, CY + XW + L);
  // Yellow center dividers
  ctx.strokeStyle = "rgba(255,208,0,0.88)"; ctx.lineWidth = 2;
  ln(ctx, CX, 0, CX, IY1); ln(ctx, CX, IY2, CX, H);
  ln(ctx, IX2, CY, W, CY); ln(ctx, 0, CY, IX1, CY);
  // Dashed lane separators
  ctx.strokeStyle = "rgba(255,255,255,0.42)"; ctx.lineWidth = 1.5; ctx.setLineDash([10, 9]);
  // North
  ln(ctx, CX + L, 0, CX + L, IY1); ln(ctx, CX + 2 * L, 0, CX + 2 * L, IY1);
  ln(ctx, CX - L, 0, CX - L, IY1); ln(ctx, CX - 2 * L, 0, CX - 2 * L, IY1);
  // South
  ln(ctx, CX - L, IY2, CX - L, H); ln(ctx, CX - 2 * L, IY2, CX - 2 * L, H);
  ln(ctx, CX + L, IY2, CX + L, H); ln(ctx, CX + 2 * L, IY2, CX + 2 * L, H);
  // East
  ln(ctx, IX2, CY + L, W, CY + L); ln(ctx, IX2, CY + 2 * L, W, CY + 2 * L);
  ln(ctx, IX2, CY - L, W, CY - L); ln(ctx, IX2, CY - 2 * L, W, CY - 2 * L);
  // West
  ln(ctx, 0, CY - L, IX1, CY - L); ln(ctx, 0, CY - 2 * L, IX1, CY - 2 * L);
  ln(ctx, 0, CY + L, IX1, CY + L); ln(ctx, 0, CY + 2 * L, IX1, CY + 2 * L);
  ctx.setLineDash([]);
}

function drawStopLines(ctx) {
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.5; ctx.setLineDash([]);
  ln(ctx, CX + L, IY1, IX2, IY1);
  ln(ctx, IX1, IY2, CX - L, IY2);
  ln(ctx, IX2, CY + L, IX2, IY2);
  ln(ctx, IX1, IY1, IX1, CY - L);
}

function drawSignal(ctx, x, y, ap, sim) {
  const green = !sim.transitioning && ap === sim.activeLane;
  const yellow = sim.transitioning && ap === sim.activeLane;
  const red = !green && !yellow;
  rr(ctx, x, y, 14, 46, 3); ctx.fillStyle = "#141414"; ctx.fill();
  ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 0.5; rr(ctx, x, y, 14, 46, 3); ctx.stroke();
  const dot = (cy, fill, glow, gc) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x + 7, cy, 5, 0, Math.PI * 2); ctx.fill();
    if (glow) { ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(x + 7, cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  };
  dot(y + 9, red ? "#ff3030" : "#280000", red, "#ff1010");
  dot(y + 23, yellow ? "#ffcc00" : "#2a1800", yellow, "#ffcc00");
  dot(y + 37, green ? "#00ee55" : "#001a08", green, "#00ff55");
}
function drawLights(ctx, sim) {
  drawSignal(ctx, IX2 + 4, IY1 - 54, "N", sim);
  drawSignal(ctx, IX1 - 18, IY2 + 6, "S", sim);
  drawSignal(ctx, IX2 + 4, CY + 85, "E", sim);
  drawSignal(ctx, IX1 - 30, IY1 - 54, "W", sim);
}

function drawSA(ctx) { ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(3, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -4); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill(); }
function drawLA(ctx) { ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, 0); ctx.lineTo(0, -9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-4, -9); ctx.lineTo(4, -9); ctx.closePath(); ctx.fill(); }
function drawRA(ctx) { ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, 0); ctx.lineTo(0, 9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(-4, 9); ctx.lineTo(4, 9); ctx.closePath(); ctx.fill(); }

function drawDirLabels(ctx) {
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.45)";

  ctx.fillText("N", NLX[1], IY1 - 100);
  ctx.fillText("S", SLX[1], IY2 + 100);
  ctx.fillText("E", IX2 + 100, ELY[1] + 5);
  ctx.fillText("W", IX1 - 100, WLY[1] + 5);

  ctx.textAlign = "left";
}

function drawArrows(ctx) {
  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2; ctx.setLineDash([]);
  const defs = [
    { x: NLX[0], y: IY1 - 72, a: Math.PI / 2, t: "R" }, { x: NLX[1], y: IY1 - 72, a: Math.PI / 2, t: "S" }, { x: NLX[2], y: IY1 - 72, a: Math.PI / 2, t: "L" },
    { x: SLX[0], y: IY2 + 72, a: -Math.PI / 2, t: "R" }, { x: SLX[1], y: IY2 + 72, a: -Math.PI / 2, t: "S" }, { x: SLX[2], y: IY2 + 72, a: -Math.PI / 2, t: "L" },
    { x: IX2 + 72, y: ELY[0], a: Math.PI, t: "R" }, { x: IX2 + 72, y: ELY[1], a: Math.PI, t: "S" }, { x: IX2 + 72, y: ELY[2], a: Math.PI, t: "L" },
    { x: IX1 - 72, y: WLY[0], a: 0, t: "R" }, { x: IX1 - 72, y: WLY[1], a: 0, t: "S" }, { x: IX1 - 72, y: WLY[2], a: 0, t: "L" },
  ];
  for (const { x, y, a, t } of defs) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); t === "L" ? drawLA(ctx) : t === "S" ? drawSA(ctx) : drawRA(ctx); ctx.restore(); }
}

// ─── Regular car ────────────────────────────────────────────────────────────
function drawRegularCar(ctx, car) {
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.ang);
  ctx.fillStyle = car.color; rr(ctx, -CH / 2, -CW / 2, CH, CW, 2); ctx.fill();
  ctx.fillStyle = "rgba(165,218,255,0.72)"; ctx.fillRect(CH / 2 - 5, -CW / 2 + 1, 4, CW - 2);
  ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(-CH / 2 + 1, -CW / 2 + 1, CH - 7, CW - 2);
  ctx.restore();
}

// ─── Ambulance vehicle ───────────
function drawAmbulanceCar(ctx, car) {
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.ang);

  const AH = 26, AW = 14;                          // length × width
  const flash = Math.floor(Date.now() / 220) % 2 === 0;

  // Outer emergency glow
  ctx.globalAlpha = flash ? 0.28 : 0.10;
  ctx.fillStyle = flash ? "#ff3030" : "#3060ff";
  rr(ctx, -AH / 2 - 4, -AW / 2 - 4, AH + 8, AW + 8, 7); ctx.fill();
  ctx.globalAlpha = 1;

  // White body
  ctx.fillStyle = "#f0f0ee";
  rr(ctx, -AH / 2, -AW / 2, AH, AW, 3); ctx.fill();

  ctx.fillStyle = "#e88000";
  ctx.fillRect(-AH / 2, AW / 2 - 4, AH, 3);

  // Flashing light bar at front (positive-x = travel direction)
  ctx.fillStyle = flash ? "#ff1515" : "#1040ee";
  ctx.fillRect(AH / 2 - 8, -AW / 2, 5, AW / 2);
  ctx.fillStyle = flash ? "#1040ee" : "#ff1515";
  ctx.fillRect(AH / 2 - 8 + 5, -AW / 2, 5, AW / 2);

  ctx.fillStyle = "#cc0000";
  ctx.fillRect(-4, -AW / 2 + 3, 8, 3.5);    // horizontal bar
  ctx.fillRect(-1.5, -AW / 2 + 1.5, 3, 6.5); // vertical bar

  // Rear windshield (back = negative x)
  ctx.fillStyle = "rgba(140,195,240,0.65)";
  ctx.fillRect(-AH / 2 + 1, -AW / 2 + 1, 5, AW - 2);

  ctx.restore();
}

function drawCar(ctx, car) {
  if (car.isAmbulance) { drawAmbulanceCar(ctx, car); }
  else { drawRegularCar(ctx, car); }
}

function drawActiveGlow(ctx, sim) {
  if (sim.transitioning) return;
  const d = sim.activeLane;
  const pos = { N: { x: CX + (NLX[1] - CX) / 2 + CX / 8, y: IY1 + 14 }, S: { x: CX - (CX - SLX[1]) / 2 - CX / 8, y: IY2 - 14 }, E: { x: IX2 - 14, y: CY + (ELY[1] - CY) / 2 + CY / 8 }, W: { x: IX1 + 14, y: CY - (CY - WLY[1]) / 2 - CY / 8 } };
  if (!pos[d]) return;
  const { x, y } = pos[d];
  ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = "#00e676"; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.18; ctx.fillStyle = "#00e676"; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBoxDetail(ctx) {
  ctx.strokeStyle = "rgba(255,208,0,0.25)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
  ctx.strokeRect(IX1 + 6, IY1 + 6, IW - 12, IW - 12); ctx.setLineDash([]);
}

// Ambulance approach warning text (shows which direction the ambulance is coming from)
function drawAmbulanceWarning(ctx, sim) {
  if (!sim.ambulance) return;
  const d = sim.ambulance.lane;
  const pos = { N: { x: CX + EW / 2, y: IY1 - 90 }, S: { x: CX - EW / 2, y: IY2 + 90 }, E: { x: IX2 + 90, y: CY + EW / 2 }, W: { x: IX1 - 90, y: CY - EW / 2 } };
  const p = pos[d]; if (!p) return;
  const flash = Math.floor(Date.now() / 500) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = flash ? 1 : 0.55;
  ctx.fillStyle = "rgba(255,165,0,0.9)"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center";
  ctx.fillText("🚨 AMB", p.x, p.y);
  ctx.restore();
}
function drawEnvironment(ctx) {
  // Trees
  const trees = [
    [105, 110], [170, 150], [235, 105],
    [830, 120], [900, 170],
    [110, 820], [190, 875],
    [820, 820], [910, 760]
  ];

  trees.forEach(([x, y]) => {
    ctx.fillStyle = "#12351f";
    ctx.beginPath();
    ctx.arc(x + 4, y + 5, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1b5e2f";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2f9d4a";
    ctx.beginPath();
    ctx.arc(x - 5, y - 5, 12, 0, Math.PI * 2);
    ctx.fill();
  });

  // Street lights
  const lights = [
    [380, 300], [620, 300],
    [380, 705], [620, 705]
  ];

  lights.forEach(([x, y]) => {
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 28);
    ctx.stroke();

    ctx.fillStyle = "#f6e58d";
    ctx.beginPath();
    ctx.arc(x, y - 32, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(246,229,141,0.18)";
    ctx.beginPath();
    ctx.arc(x, y - 32, 18, 0, Math.PI * 2);
    ctx.fill();
  });
}

function render(ctx, sim) {
  ctx.fillStyle = "#2c6a3c"; ctx.fillRect(0, 0, W, H);
  drawEnvironment(ctx);
  drawRoads(ctx); drawHeat(ctx, sim.cong, sim.gf); drawBoxDetail(ctx); drawMarkings(ctx);
  drawStopLines(ctx); drawLights(ctx, sim); drawArrows(ctx); drawDirLabels(ctx);
  // Draw regular cars first, then ambulance on top
  for (const c of sim.cars) if (!c.done && !c.isAmbulance) drawCar(ctx, c);
  for (const c of sim.cars) if (!c.done && c.isAmbulance) drawCar(ctx, c);
  drawActiveGlow(ctx, sim); drawAmbulanceWarning(ctx, sim);
}

// UI HELPERS
const C = {
  bg: "#080a10", surface: "#0c0e18", card: "#0e1020", border: "#1a1e2c",
  text: "#d0d5ec", muted: "#5a6080", dim: "#333750",
  green: "#00e676", greenBg: "#0a2416",
  red: "#ff4444", redBg: "#1e0808",
  amber: "#ffaa00", amberBg: "#261400",
  yellow: "#ffcc00", blue: "#3a8fff", teal: "#00d4aa",
};
// Formats seconds into MM:SS format for the session timer
const fmtTime = s => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
const barColor = pct => pct > 70 ? "#ff3a3a" : pct > 45 ? "#ffaa00" : pct > 20 ? "#f1c40f" : "#00e676";
// Returns congestion bar color based on congestion percentage
function DirBadge({ dir, sz = 22 }) {
  const col = DIR_CLR[dir];
  return (<div style={{ width: sz, height: sz, borderRadius: 4, background: `${col}1e`, border: `1px solid ${col}55`, display: "flex", alignItems: "center", justifyContent: "center", color: col, fontWeight: "bold", fontSize: sz * 0.55, fontFamily: "monospace", flexShrink: 0 }}>{dir}</div>);
}

function TopStrip({ ai, activeLane, sessionSecs, transitioning, navigate }) {
  return (
    <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, userSelect: "none", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 18px", borderBottom: `1px solid ${C.border}40` }}>
        <span
          onClick={() => navigate("/")}
          style={{
            color: C.muted,
            fontSize: 12,
            cursor: "pointer",
            letterSpacing: "0.02em"
          }}
        >
          Home
        </span>
        <span style={{ color: C.border }}>│</span>

        <span
          onClick={async () => {
            await signOut(auth);
            navigate("/login");
          }}
          style={{
            color: C.muted,
            fontSize: 12,
            cursor: "pointer",
            letterSpacing: "0.02em"
          }}
        >
          Logout
        </span>
        <span style={{ color: C.border }}>│</span>
        <span style={{ color: C.text, fontSize: 11, fontWeight: 500, letterSpacing: "0.1em" }}>EVALANE SIMULATION</span>
        {ai.congested && <span style={{ fontSize: 9, padding: "2px 9px", borderRadius: 10, background: C.redBg, color: C.red, border: `1px solid ${C.red}35`, letterSpacing: "0.08em" }}>● CONGESTION DETECTED</span>}
        {ai.amb && <span style={{ fontSize: 9, padding: "2px 9px", borderRadius: 10, background: C.amberBg, color: C.amber, border: `1px solid ${C.amber}35`, letterSpacing: "0.08em" }}>🚨 AMBULANCE ACTIVE</span>}
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "monospace",
            color: sessionSecs <= 30 ? C.red : C.muted,
            fontSize: 19,
            letterSpacing: "0.08em",
            fontWeight: sessionSecs <= 30 ? "bold" : "normal",
            animation: sessionSecs <= 30 ? "timerPulse 1s infinite" : "none"
          }}
        >
          {fmtTime(sessionSecs)}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          padding: "0 18px 0 250px",
          height: 38,
          overflow: "hidden",
          width: "100%"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 9, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>RECOMMENDED LANE</span>
          <DirBadge dir={ai.lane} sz={26} />
          <span style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{ai.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 10, background: "#0a201c", border: "1px solid #00d4aa35", color: C.teal, fontSize: 9, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>● SUGGESTED</span>
        </div>

        <div style={{ width: 1, height: 22, background: C.border, margin: "0 14px", flexShrink: 0 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 9, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>SUGGESTED DURATION</span>
  
          <span style={{ color: C.yellow, fontSize: 26, fontFamily: "monospace", fontWeight: "bold", lineHeight: 1 }}>{ai.dur}</span>
          <span style={{ color: "#fff", fontSize: 9 }}>seconds</span>
        </div>

        <div style={{ width: 1, height: 22, background: C.border, margin: "0 14px", flexShrink: 0 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 9, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>OVERALL CONGESTION</span>
          <span style={{ color: "#ffcc00", fontSize: 16, fontWeight: "bold" }}>{ai.level || "--"}</span>
        </div>
      </div>
    </div>
  );
}
// Card component for one lane direction in the lane control panel
function LaneCard({ dir, ui, ai, onOpen, customTime, editing, onEditStart, onEditEnd, onSetTime }) {
  const isActive = ui.activeLane === dir && !ui.transitioning;
  const isYellow = ui.activeLane === dir && ui.transitioning;
  const hasAmb = ui.ambulance?.lane === dir;
  const count = ui.laneCounts?.[dir] ?? 0;
  const capacity = 30;
  const congPct = Math.min(99, Math.round((count / capacity) * 100));
  const bc = barColor(congPct);
  const isAIPick = ai.lane === dir;
  const dispDur = customTime ?? 30;
  const borderAccent = isActive ? C.green : isYellow ? C.yellow : hasAmb ? C.amber : C.border;
  return (
    <div style={{ background: C.card, border: `1px solid ${isActive ? "#00e67620" : hasAmb ? "#ffaa0020" : C.border}`, borderLeft: `3px solid ${borderAccent}`, borderRadius: 6, padding: "7px 11px", marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <DirBadge dir={dir} sz={21} />
        <span style={{ color: "#b0b5d0", fontSize: 13, fontWeight: 500, flex: 1 }}>{NAMES[dir]}</span>
        {isAIPick && !isActive && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 8, background: "#0a201c", color: C.teal, border: `1px solid ${C.teal}35` }}>SUGGESTED</span>}
        <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 2, background: isActive ? C.greenBg : isYellow ? "#281a00" : C.redBg, color: isActive ? C.green : isYellow ? C.yellow : C.red, border: `1px solid ${isActive ? C.green + "40" : isYellow ? C.yellow + "40" : C.red + "40"}`, letterSpacing: "0.06em" }}>
          {isActive ? "OPEN" : isYellow ? "SWITCHING" : "CLOSED"}
        </span>
      </div>
      <div style={{ marginBottom: 5 }}>

        <div style={{ color: "#7080a0", fontSize: 12 }}>
          {count} car{count !== 1 ? "s" : ""}
        </div>

        <div
          style={{
            color: ai.cong[dir] > 65
              ? C.red
              : ai.cong[dir] > 40
                ? C.amber
                : C.green,
            fontSize: 11,
            marginTop: 4
          }}
        >
          Predicted Congestion: {ai.cong[dir]}%
        </div>

        {hasAmb && (
          <span
            style={{
              fontSize: 8,
              padding: "1px 6px",
              borderRadius: 8,
              background: C.amberBg,
              color: C.amber,
              border: `1px solid ${C.amber}40`,
              letterSpacing: "0.06em"
            }}
          >
            🚨 AMB
          </span>
        )}

      </div>
      <div style={{ background: "#1a1e2c", borderRadius: 3, height: 4, marginBottom: 7, overflow: "hidden" }}>
        <div style={{ width: `${congPct}%`, background: bc, height: 5, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      {editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 9, background: "#0a0c18", borderRadius: 4, padding: "5px 7px", border: `1px solid ${C.border}` }}>
          <span style={{ color: "#fff", fontSize: 9, letterSpacing: "0.08em", flex: 1 }}>GREEN TIME</span>
          <button onClick={() => onSetTime(Math.max(15, dispDur - 1))} style={smallBtnStyle}>−</button>
          <span style={{ color: C.yellow, fontFamily: "monospace", fontSize: 13, minWidth: 36, textAlign: "center" }}>
            {dispDur}s
          </span>
          <button onClick={() => onSetTime(Math.min(75, dispDur + 1))} style={smallBtnStyle}>+</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 5 }}>
        {isActive ? (
          <button style={ctaStyle("green")}>
            OPEN
          </button>
        ) : (
          <button onClick={() => onOpen(dir)} style={ctaStyle("red")}>
            Open lane
          </button>
        )}
        <button
          onClick={
            editing
              ? onEditEnd
              : customTime !== null
                ? () => onSetTime(null)
                : onEditStart
          }
          style={ctaStyle("dim")}
        >
          {editing ? "Done" : customTime !== null ? "Reset time" : "Change time"}
        </button>
      </div>
    </div>
  );
}

const ctaStyle = v => ({ flex: 1, padding: "6px 0", borderRadius: 4, fontSize: 10, fontWeight: 500, cursor: "pointer", border: "1px solid", fontFamily: "monospace", letterSpacing: "0.04em", transition: "opacity 0.15s", background: v === "green" ? C.greenBg : v === "red" ? C.redBg : C.card, color: v === "green" ? C.green : v === "red" ? C.red : C.muted, borderColor: v === "green" ? `${C.green}40` : v === "red" ? `${C.red}40` : C.border });
const smallBtnStyle = { width: 28, height: 26, borderRadius: 3, fontSize: 12, fontWeight: "bold", cursor: "pointer", background: "#14182a", color: "#8890a8", border: `1px solid ${C.border}` };

function LeftPanel({ ui, ai, onOpen, customTimes, onCustomTime }) {
  const [editing, setEditing] = useState(null);
  const greenSecs = Math.max(0, Math.ceil((ui.greenTimer || 0) / 1000));
  return (
    <div style={{ width: 252, display: "flex", flexDirection: "column", background: C.surface, borderRight: `1px solid ${C.border}`, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, color: "#fff", letterSpacing: "0.12em", fontWeight: 500 }}>LANE CONTROLS</div>
      <div style={{ flex: 1, overflowY: "auto", padding: "7px 7px 0", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
        {["N", "S", "E", "W"].map(d => (
          <LaneCard key={d} dir={d} ui={ui} ai={ai} onOpen={onOpen}
            customTime={customTimes[d]} editing={editing === d}
            onEditStart={() => setEditing(d)} onEditEnd={() => setEditing(null)}
            onSetTime={t => onCustomTime(d, t)} />
        ))}
      </div>
      <div style={{ padding: "14px", borderTop: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#fff", fontSize: 16, letterSpacing: "0.1em" }}>GREEN TIMER</span>
          <span style={{ color: ui.transitioning ? C.amber : C.green, fontSize: 32, fontFamily: "monospace", fontWeight: "bold", lineHeight: 1 }}>
            {ui.transitioning ? "---" : `${greenSecs}s`}
          </span>
        </div>
        <div style={{ color: "#fff", fontSize: 11 }}>
          Active: <span style={{ color: C.text }}>{ui.transitioning ? "Switching..." : NAMES[ui.activeLane] || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// Main simulation page component that controls the whole traffic simulation
export default function EvalaneSimPage() {
  const navigate = useNavigate();
  const cvRef = useRef(null);
  const simRef = useRef(null);
  const rafRef = useRef(null);
  const pausedRef = useRef(true);
  // UI state displayed on the screen, synced from the simulation object
  const [ui, setUI] = useState({
    activeLane: "N", greenTimer: 8000, greenDuration: 8, transitioning: false,
    laneCounts: { N: 0, S: 0, E: 0, W: 0 }, cong: { N: 0, S: 0, E: 0, W: 0 }, gf: { N: 0, S: 0, E: 0, W: 0 }, ambulance: null
  });
  const [, setTotalDecisions] = useState(0);
  const [, setCorrectDecisions] = useState(0);
  const [sessionSecs, setSessionSecs] = useState(SESSION_LIMIT);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(true);

  const [customTimes, setCustomTimes] = useState({ N: null, S: null, E: null, W: null });
  // Stores AI prediction received from backend model
  const [backendAI, setBackendAI] = useState(null);

  const [previousScore, setPreviousScore] = useState(null);
  const [score, setScore] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(() => {
    return localStorage.getItem("evalaneTutorialDone") ? null : 0;
  });
  // Local fallback AI recommendation calculated from current lane counts
  const localAI = useMemo(() => computeAI(ui.laneCounts, ui.ambulance), [ui.laneCounts, ui.ambulance]);
  // Use backend AI when available, otherwise fallback to local rule-based AI
  const ai = backendAI || localAI;

  // Canvas simulation loop
  // Starts and manages the main canvas simulation loop
  useEffect(() => {
    const canvas = cvRef.current;
    const ctx = canvas.getContext("2d");
    const sim = {
      cars: [], activeLane: "N", greenTimer: 30000, greenDuration: 30,
      transitioning: false, transitionTimer: 0, manualOverride: null,
      laneCounts: { N: 0, S: 0, E: 0, W: 0 }, cong: { N: 0, S: 0, E: 0, W: 0 },
      gf: { N: 0, S: 0, E: 0, W: 0 }, ambulance: null,
      ambulanceNext: 60000 + Math.random() * 120000,
      spawnT: {
        N: 500 + Math.random() * 2000,
        S: 500 + Math.random() * 2000,
        E: 500 + Math.random() * 2000,
        W: 500 + Math.random() * 2000
      }, lastTime: null, paused: true,
      customDurations: { N: null, S: null, E: null, W: null },
    };
    simRef.current = sim;

    const loop = (ts) => {
      if (!sim.lastTime) { sim.lastTime = ts; rafRef.current = requestAnimationFrame(loop); return; }
      const dt = Math.min(ts - sim.lastTime, 50); sim.lastTime = ts;
      if (sim.paused) { render(ctx, sim); rafRef.current = requestAnimationFrame(loop); return; }

      // ── Ambulance event ──────────────────────────────────────────────────
      sim.ambulanceNext -= dt;
      // Create a new ambulance event with a random direction
      if (sim.ambulanceNext <= 0 && !sim.ambulance) {
        const lns = ["N", "S", "E", "W"];
        const lane = lns[Math.floor(Math.random() * 4)];
        sim.ambulance = { lane, timer: 28000, spawned: false };
        sim.ambulanceNext = 90000 + Math.random() * 150000;
      }
      // Handle active ambulance event
      if (sim.ambulance) {
        // Spawn the ambulance vehicle exactly once per event
        if (!sim.ambulance.spawned) {
          spawnAmbulanceCar(sim);
          sim.ambulance.spawned = true;
        }
        sim.ambulance.timer -= dt;
        if (sim.ambulance.timer <= 0) sim.ambulance = null;
      }

      // ── Green timer ──────────────────────────────────────────────────────
      if (!sim.transitioning) {
        // Reduce active green lane timer
        sim.greenTimer -= dt;
        // Start yellow transition when green time ends or user manually opens another lane
        if (sim.greenTimer <= 0 || sim.manualOverride !== null) {
          sim.transitioning = true; sim.transitionTimer = 1600;
        }
      } else {
        sim.transitionTimer -= dt;
        if (sim.transitionTimer <= 0) {
          sim.transitioning = false;
          // Automatic lane rotation order
          const order = ["N", "S", "E", "W"];
          const currentIdx = order.indexOf(sim.activeLane);
          const autoNext = order[(currentIdx + 1) % 4];
          // Use manual user choice if available, otherwise use automatic next lane
          const next = sim.manualOverride || autoNext;
          // Apply custom green duration or default to 30 seconds
          const dur = sim.customDurations[next] || 30;
          sim.activeLane = next; sim.manualOverride = null;
          sim.greenTimer = dur * 1000; sim.greenDuration = dur;
          sim.gf[next] = 1500;
          sim.customDurations[next] = null;
        }
      }
      for (const d of "NSEW") if (sim.gf[d] > 0) sim.gf[d] = Math.max(0, sim.gf[d] - dt);

      // ── Spawn regular cars ───────────────────────────────────────────────
      for (const d of ["N", "S", "E", "W"]) {
        sim.spawnT[d] -= dt;
        // Different spawn intervals create asymmetric traffic flow
        const spawnRates = {
          N: [1600, 2800],
          S: [2600, 4200],
          E: [900, 1800],
          W: [1100, 2200]
        };
        // Spawn a new vehicle in a random lane when timer reaches zero
        if (sim.spawnT[d] <= 0) {
          doSpawn(sim, d, Math.floor(Math.random() * 3));

          const [min, max] = spawnRates[d];
          sim.spawnT[d] = min + Math.random() * (max - min);
        }
      }

      // ── Update all cars ──────────────────────────────────────────────────
      for (const c of sim.cars) stepCar(c, dt, sim);
      sim.cars = sim.cars.filter(c => !c.done);
      if (sim.ambulance && sim.ambulance.spawned) {
        const ambulanceStillExists = sim.cars.some(c => c.isAmbulance && !c.done);

        if (!ambulanceStillExists) {
          sim.ambulance = null;
        }
      }

      // ── Lane counts & congestion ─────────────────────────────────────────
      for (const d of ["N", "S", "E", "W"]) {
        sim.laneCounts[d] = sim.cars.filter(c => c.ap === d && !c.done && c.pi <= 1 && !c.isAmbulance).length;
        const tgt = Math.min(1, sim.laneCounts[d] / 20);
        sim.cong[d] += (tgt - sim.cong[d]) * Math.min(0.09, dt * 0.003);
        if (sim.cong[d] < 0.004) sim.cong[d] = 0;
      }

      render(ctx, sim);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // UI sync (150 ms)
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const sim = simRef.current; if (!sim) return;
      setUI({
        activeLane: sim.activeLane, greenTimer: sim.greenTimer, greenDuration: sim.greenDuration,
        transitioning: sim.transitioning, laneCounts: { ...sim.laneCounts },
        cong: { ...sim.cong }, gf: { ...sim.gf }, ambulance: sim.ambulance ? { ...sim.ambulance } : null
      });
    }, 150);
    return () => clearInterval(id);
  }, [started]);
  // Saves completed simulation session results to Firestore
  const saveSession = useCallback(async (finalScore, finalCorrect, finalTotal) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Create a unique Firestore document for this session
      const sessionRef = doc(db, "users", user.uid, "sessions", Date.now().toString());
      // Store final session performance data
      await setDoc(sessionRef, {
        score: finalScore,
        correctDecisions: finalCorrect,
        totalDecisions: finalTotal,
        avgCongestion: ai.avg,
        createdAt: new Date(),
      });
      setPreviousScore(finalScore);

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          previousScore: finalScore
        });
      }
    } catch (err) {
      console.error("Failed to save session:", err);
    }
  }, [ai.avg]);
  useEffect(() => {
    const loadPreviousScore = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        // Query the latest saved session for the current user
        const q = query(
          collection(db, "users", user.uid, "sessions"),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        // If a previous session exists, display its score
        const snap = await getDocs(q);
        if (!snap.empty) {
          setPreviousScore(snap.docs[0].data().score);
        }
      } catch (err) {
        console.error("Failed to load previous score:", err);
      }
    };

    loadPreviousScore();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) {
        setSessionSecs(s => {
          // End the session when countdown reaches zero
          if (s <= 1) {
            pausedRef.current = true;

            if (simRef.current) {
              simRef.current.paused = true;
            }

            setPaused(true);
            setFinished(true);
            setTotalDecisions(finalTotal => {
              setCorrectDecisions(finalCorrect => {
                const finalScore = score;
                saveSession(finalScore, finalCorrect, finalTotal);
                setPreviousScore(finalScore);
                return finalCorrect;
              });
              return finalTotal;
            });
            return 0;
          }

          return s - 1;
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [saveSession, score]);
  // Sync custom times → sim
  useEffect(() => { if (simRef.current) simRef.current.customDurations = { ...customTimes }; }, [customTimes]);

  // Backend AI prediction - update every 5 seconds
  useEffect(() => {
    if (!started) return;
    // Sends current traffic data to backend model and receives recommendation
    const fetchAI = async () => {
      try {
        const sim = simRef.current;
        if (!sim) return;
        const counts = sim.laneCounts;
        const local = computeAI(counts, sim.ambulance);
        const response = await fetch("https://evalane-api.onrender.com/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Lane_N_Count: counts.N,
            Lane_S_Count: counts.S,
            Lane_E_Count: counts.E,
            Lane_W_Count: counts.W,
            Congestion_N: local.cong.N,
            Congestion_S: local.cong.S,
            Congestion_E: local.cong.E,
            Congestion_W: local.cong.W,
            Current_Green_Lane: sim.activeLane,
            Green_Timer_Remaining: Math.ceil(sim.greenTimer / 1000),
            Event_Type: sim.ambulance ? "Ambulance" : "Normal",
            Event_Lane: sim.ambulance ? sim.ambulance.lane : null,
          })
        });
        const data = await response.json();
        // Store backend AI recommendation in React state
        setBackendAI({
          lane: data.optimal_action.replace("GREEN_", ""),
          name: NAMES[data.optimal_action.replace("GREEN_", "")],
          dur: data.signal_duration,
          cong: local.cong, avg: local.avg,
          congested: local.congested,
          amb: !!sim.ambulance,
          level: data.congestion_level,
          confidence: data.congestion_confidence,
        });
      } catch (err) { console.error(err); }
    };
    fetchAI();
    const id = setInterval(fetchAI, 5000);
    return () => clearInterval(id);
  }, [started]);

  const openLane = useCallback((lane) => {
    const sim = simRef.current; if (!sim) return;
    if (sim.activeLane === lane && !sim.transitioning) return;
    const aiPick = backendAI || computeAI(sim.laneCounts, sim.ambulance);
    // Count this as one user decision
    setTotalDecisions(t => t + 1);
    // Reward the user if their decision matches the AI recommendation
    if (lane === aiPick.lane) {
      setCorrectDecisions(c => c + 1);
      setScore(s => Math.min(100, s + 10));
    } else {
      setScore(s => Math.max(0, s - 5));
    }

    sim.manualOverride = lane;
    sim.greenTimer = 0;
  }, [backendAI]);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    if (simRef.current) simRef.current.paused = pausedRef.current;
    setPaused(p => !p);
  }, []);

  const resetSim = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;

    sim.cars = [];
    sim.activeLane = "N";
    sim.greenTimer = 30000;
    sim.greenDuration = 30;

    sim.transitioning = false;
    sim.manualOverride = null;
    sim.ambulance = null;

    sim.laneCounts = {
      N: Math.floor(Math.random() * 8),
      S: Math.floor(Math.random() * 8),
      E: Math.floor(Math.random() * 8),
      W: Math.floor(Math.random() * 8)
    };
    sim.cong = { N: 0, S: 0, E: 0, W: 0 };
    sim.gf = { N: 0, S: 0, E: 0, W: 0 };
    sim.spawnT = { N: 500, S: 1300, E: 850, W: 200 };
    sim.ambulanceNext = 60000 + Math.random() * 120000;
    sim.paused = true;
    sim.lastTime = null;
    setFinished(false);
    setStarted(false);
    setSessionSecs(SESSION_LIMIT);

    setPaused(true);
    pausedRef.current = true;
    setTotalDecisions(0);
    setCorrectDecisions(0);
    setScore(0);
    setBackendAI(null);
    setCustomTimes({ N: null, S: null, E: null, W: null });

    setUI({
      activeLane: "N",
      greenTimer: 30000,
      greenDuration: 30,
      transitioning: false,
      laneCounts: { N: 0, S: 0, E: 0, W: 0 },
      cong: { N: 0, S: 0, E: 0, W: 0 },
      gf: { N: 0, S: 0, E: 0, W: 0 },
      ambulance: null
    });

    const canvas = cvRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      render(ctx, sim);
    }
  }, []);

  const setCustomTime = useCallback((dir, t) => { setCustomTimes(prev => ({ ...prev, [dir]: t })); }, []);

  const scoreCol = score >= 70 ? C.green : score >= 40 ? C.amber : C.red;

  const grade =
    score >= 80 ? { label: "Excellent", color: "#00e676" } :
      score >= 60 ? { label: "Good", color: "#00d4aa" } :
        score >= 40 ? { label: "Satisfactory", color: "#ffcc00" } :
          { label: "Needs Improvement", color: "#ff4444" };
  const finishTutorial = () => {
    localStorage.setItem("evalaneTutorialDone", "true");
    setTutorialStep(null);
  };
  const tutorialSteps = [
    {
      title: "AI Recommendation",
      text: "This section shows the lane suggested by the AI model and the recommended green-light duration.",
      top: 95,
      left: "50%",
      arrow: {
        top: -8,
        left: 140
      }
    },
    {
      title: "Lane Controls",
      text: "Use this panel to open a lane manually and compare your decision with the AI suggestion.",
      top: 170,
      left: 270,
      arrow: {
        top: 40,
        left: -8
      }
    },
    {
      title: "Change Time",
      text: "You can adjust the green-light duration before opening a lane.",
      top: 360,
      left: 270,
      arrow: {
        top: 110,
        left: -8
      }
    },
    {
      title: "Score",
      text: "Your score improves when your decisions match the AI recommendation.",
      bottom: 70,
      right: 110,
      arrow: {
        bottom: -8,
        left: 275
      }
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg, color: C.text, overflow: "hidden", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
      <style>
        {`
    @keyframes timerPulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(1.08); }
      100% { opacity: 1; transform: scale(1); }
    }
  `}
      </style>
      <TopStrip
        ai={ai}
        activeLane={ui.activeLane}
        sessionSecs={sessionSecs}
        transitioning={ui.transitioning}
        navigate={navigate}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <LeftPanel ui={ui} ai={ai} onOpen={openLane} customTimes={customTimes} onCustomTime={setCustomTime} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#090b10" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0", overflow: "hidden", width: "100%", height: "100%", position: "relative" }}>

            <canvas ref={cvRef} width={W} height={H}
              style={{
                width: "120vmin", height: "120vmin", borderRadius: 6,
                boxShadow: "0 8px 48px rgba(0,0,0,0.88)", border: "1px solid rgba(255,255,255,0.05)"
              }} />
            {!started && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.45)",
                  zIndex: 20
                }}
              >
                <div
                  style={{
                    background: "#071018",
                    border: "1px solid rgba(0,255,150,.25)",
                    borderRadius: 12,
                    padding: "28px 36px",
                    textAlign: "center",
                    boxShadow: "0 12px 50px rgba(0,0,0,.65)"
                  }}
                >
                  <div
                    style={{
                      color: "#fff",
                      fontSize: 22,
                      fontWeight: 700,
                      marginBottom: 10
                    }}
                  >
                    Ready to start simulation
                  </div>


                  <div
                    style={{
                      color: "#8aa0b8",
                      fontSize: 14,
                      marginBottom: 18
                    }}
                  >
                    Observe the intersection, then make your decisions
                  </div>
                  <div style={{
                    color: "#8aa0b8",
                    fontSize: 12,
                    marginTop: 8,
                    marginBottom: 12
                  }}>
                    Previous Score:{" "}
                    <span style={{
                      color: "#00e676",
                      fontWeight: 700
                    }}>
                      {previousScore ?? "--"}/100
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setStarted(true);
                      setPaused(false);
                      pausedRef.current = false;
                      if (simRef.current) {
                        simRef.current.paused = false;
                      }
                    }}
                    style={{
                      background: "#00d47e",
                      color: "#00140d",
                      border: "none",
                      borderRadius: 8,
                      padding: "12px 28px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    ▶ Start Simulation
                  </button>
                </div>
              </div>
            )}
            {started && paused && !finished && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.45)",
                  zIndex: 22
                }}
              >
                <div
                  style={{
                    background: "#071018",
                    border: "1px solid rgba(255,204,0,.35)",
                    borderRadius: 12,
                    padding: "26px 34px",
                    textAlign: "center",
                    boxShadow: "0 12px 50px rgba(0,0,0,.65)"
                  }}
                >
                  <div style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 10 }}>
                    Simulation Paused
                  </div>

                  <div style={{ color: "#8aa0b8", fontSize: 14, marginBottom: 18 }}>
                    The traffic simulation is temporarily stopped
                  </div>

                  <button
                    onClick={togglePause}
                    style={{
                      background: "#00d47e",
                      color: "#00140d",
                      border: "none",
                      borderRadius: 8,
                      padding: "12px 28px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    ▶ Resume Simulation
                  </button>
                </div>
              </div>
            )}
            {finished && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", zIndex: 25 }}>
                <div style={{ background: "#071018", border: "1px solid rgba(0,255,150,.25)", borderRadius: 12, padding: "32px 40px", textAlign: "center", minWidth: 320 }}>

                  <div style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
                    Session Complete
                  </div>
                  <div style={{ color: "#5a6080", fontSize: 13, marginBottom: 28 }}>
                    Here is how you performed
                  </div>

                  <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 16 }}>
                    <div style={{ color: "#5a6080", fontSize: 11, letterSpacing: "0.1em", marginBottom: 6 }}>FINAL SCORE</div>
                    <div style={{ color: scoreCol, fontFamily: "monospace", fontSize: 42, fontWeight: "bold", lineHeight: 1 }}>
                      {score}
                    </div>
                    <div style={{ color: "#5a6080", fontSize: 11, marginTop: 4 }}>out of 100</div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 20
                    }}
                  >
                    <span
                      style={{
                        color: grade.color,
                        fontSize: 10
                      }}
                    >
                      ●
                    </span>
                    <span
                      style={{
                        color: grade.color,
                        fontSize: 18,
                        fontWeight: 700,
                        letterSpacing: "0.04em"
                      }}
                    >
                      {grade.label}
                    </span>
                  </div>
                  <button onClick={resetSim} style={{ background: "#00d47e", color: "#00140d", border: "none", borderRadius: 8, padding: "12px 28px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                    Run New Session
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderTop: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
            <button onClick={togglePause} style={{ padding: "6px 18px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `1px solid ${paused ? C.green + "60" : C.border}`, fontFamily: "monospace", letterSpacing: "0.08em", background: paused ? C.greenBg : C.card, color: paused ? C.green : C.muted, transition: "all 0.15s" }}>
              {paused ? "▶  RESUME" : "⏸  PAUSE"}
            </button>
            <button onClick={resetSim} style={{ padding: "6px 18px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `1px solid ${C.border}`, fontFamily: "monospace", letterSpacing: "0.08em", background: C.card, color: C.muted }}>⟳  RESET</button>

            <button
              onClick={() => {
                setShowFinishConfirm(true);
                setPaused(true);
                pausedRef.current = true;
                if (simRef.current) simRef.current.paused = true;
              }}
              style={{
                padding: "6px 18px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                border: `1px solid ${C.border}`,
                fontFamily: "monospace",
                letterSpacing: "0.08em",
                background: C.card,
                color: C.muted
              }}
            >
              ⏹ FINISH
            </button>

            <div style={{ flex: 1 }} />
            <span style={{ color: "#fff", fontSize: 9, letterSpacing: "0.1em" }}>SCORE</span>
            <span style={{ color: scoreCol, fontFamily: "monospace", fontSize: 22, fontWeight: "bold" }}>
              {score}
            </span>
            <span style={{ color: "#fff", fontSize: 9 }}>/ 100</span>
          </div>
        </div>
      </div>
      {tutorialStep !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.35)",
            pointerEvents: "auto"
          }}
        >
          <div
            style={{
              position: "absolute",
              ...tutorialSteps[tutorialStep],
              transform:
                tutorialSteps[tutorialStep].left === "50%"
                  ? "translateX(-50%)"
                  : "none",
              width: 310,
              background: "#ffffff",
              color: "#0b1020",
              borderRadius: 12,
              padding: "16px 18px",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              border: "1px solid rgba(0,0,0,0.08)"
            }}
          >
            <div
              style={{
                position: "absolute",
                width: 16,
                height: 16,
                background: "#ffffff",
                transform: "rotate(45deg)",
                ...tutorialSteps[tutorialStep].arrow
              }}
            />
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                marginBottom: 6
              }}
            >
              {tutorialSteps[tutorialStep].title}
            </div>

            <div
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: "#344054",
                marginBottom: 14
              }}
            >
              {tutorialSteps[tutorialStep].text}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <span style={{ fontSize: 12, color: "#667085" }}>
                {tutorialStep + 1} / {tutorialSteps.length}
              </span>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={finishTutorial}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#667085",
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  Skip
                </button>

                <button
                  onClick={() => {
                    if (tutorialStep === tutorialSteps.length - 1) {
                      finishTutorial();
                    } else {
                      setTutorialStep(s => s + 1);
                    }
                  }}
                  style={{
                    border: "none",
                    background: "#00d47e",
                    color: "#00140d",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {tutorialStep === tutorialSteps.length - 1 ? "Got it!" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showFinishConfirm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            zIndex: 30
          }}
        >
          <div
            style={{
              background: "#071018",
              border: "1px solid rgba(255,204,0,.35)",
              borderRadius: 12,
              padding: "26px 34px",
              textAlign: "center",
              minWidth: 340,
              boxShadow: "0 12px 50px rgba(0,0,0,.65)"
            }}
          >
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 10 }}>
              Finish Session?
            </div>

            <div style={{ color: "#8aa0b8", fontSize: 14, marginBottom: 22 }}>
              You can end the simulation now and view your current results.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => {
                  setShowFinishConfirm(false);
                  setPaused(false);
                  pausedRef.current = false;
                  if (simRef.current) simRef.current.paused = false;
                }}
                style={{
                  background: C.card,
                  color: C.muted,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "10px 22px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setShowFinishConfirm(false);
                  setFinished(true);
                  setPaused(true);
                  pausedRef.current = true;
                  if (simRef.current) simRef.current.paused = true;
                }}
                style={{
                  background: "#00d47e",
                  color: "#00140d",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 22px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}