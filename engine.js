// Deterministic engine (browser-safe) — inspired by repo specs.
// Implements a minimal BotInstructions v1 compiler+VM sufficient for examples/bot2.md and bot3.md.
// This is a skeleton implementation to enable a playable replay viewer.

/** @typedef {"BOT1"|"BOT2"|"BOT3"|"BOT4"} BotId */

/** @typedef {{sector:number, zone:number}} Loc */

/** @typedef {{kind:"COLOR", color:string}} Appearance */

/** @typedef {{slot1:string|null, slot2:string|null, slot3:string|null}} Loadout */

/** @typedef {{
 *  id: BotId,
 *  displayName: string,
 *  appearance: Appearance,
 *  loadout: Loadout,
 *  sourceText: string,
 * }} ReplayBotHeader */

/** @typedef {{
 *  id: BotId,
 *  loc: Loc,
 *  alive: boolean,
 *  health: number,
 *  ammo: number,
 *  energy: number,
 *  pc: number,
 *  targetBotId: BotId|null,
 *  targetPowerupType: "HEALTH"|"AMMO"|"ENERGY"|null,
 *  moveGoal: any,
 *  slotCooldownRemaining: {slot1:number, slot2:number, slot3:number},
 *  moveCooldownRemaining: number,
 *  lastDamageByBotId: BotId|null,
 *  kills: number,
 *  points: number,
 * }} BotState */

/** @typedef {{
 *  bulletId: number,
 *  ownerBotId: BotId,
 *  targetBotId: BotId|null,
 *  sector: number,
 *  dir: "UP"|"DOWN"|"LEFT"|"RIGHT",
 *  ttlRemaining: number,
 * }} Bullet */

/** @typedef {{
 *  powerupId: number,
 *  type: "HEALTH"|"AMMO"|"ENERGY",
 *  loc: Loc,
 * }} Powerup */

/** @typedef {{
 *  tick: number,
 *  rngState: number,
 *  bots: BotState[],
 *  bullets: Bullet[],
 *  powerups: Powerup[],
 *  spawnRemainingTicks: number,
 *  nextPowerupId: number,
 *  nextBulletId: number,
 *  winnerBotId: BotId|null,
 *  ended: boolean,
 *  endReason: "LAST_ALIVE"|"TICK_CAP"|null,
 * }} MatchState */

/** @typedef {{type:string, [k:string]:any}} ReplayEvent */

/** @typedef {{
 *  schemaVersion: string,
 *  rulesetVersion: string,
 *  ticksPerSecond: number,
 *  matchSeed: number,
 *  tickCap: number,
 *  bots: ReplayBotHeader[],
 * }} ReplayHeader */

/** @typedef {{
 *  header: ReplayHeader,
 *  state: any[],
 *  events: ReplayEvent[][],
 *  result: {
 *    endReason: "LAST_ALIVE"|"TICK_CAP",
 *    winnerBotId: BotId|null,
 *    bots: Array<{botId:BotId, kills:number, points:number, alive:boolean}>,
 *  }
 * }} Replay */

// ---------------- RNG ----------------

/**
 * Small deterministic RNG (xorshift32).
 * @param {number} seed
 */
export function createRng(seed) {
  let s = (seed | 0) >>> 0;
  if (s === 0) s = 0x12345678;
  return {
    /** @returns {number} u32 */
    nextU32() {
      // xorshift32
      s ^= (s << 13) >>> 0;
      s ^= (s >>> 17) >>> 0;
      s ^= (s << 5) >>> 0;
      return (s >>> 0);
    },
    /** @returns {number} in [0,1) */
    next01() {
      return this.nextU32() / 0x100000000;
    },
    /** @param {number} min @param {number} max */
    intInclusive(min, max) {
      const span = (max - min + 1);
      return min + (this.nextU32() % span);
    },
    /** @returns {number} current internal state (for snapshots) */
    getState() { return s >>> 0; },
    /** @param {number} st */
    setState(st) { s = (st >>> 0); if (s === 0) s = 0x12345678; },
  };
}

// ------------- Arena anchors + adjacency (v1) -------------

/** @returns {Loc[]} */
export function enumerateAnchors() {
  /** @type {Loc[]} */
  const out = [];
  for (let s = 1; s <= 9; s++) {
    out.push({ sector: s, zone: 0 });
    for (let z = 1; z <= 4; z++) out.push({ sector: s, zone: z });
  }
  return out;
}

/** @param {Loc} a @param {Loc} b */
export function locEq(a, b) {
  return a.sector === b.sector && a.zone === b.zone;
}

/** tie-break per docs: sector asc, zone=0 first, then zone asc */
/** @param {Loc} a @param {Loc} b */
export function compareLoc(a, b) {
  if (a.sector !== b.sector) return a.sector - b.sector;
  const az = (a.zone === 0 ? -1 : a.zone);
  const bz = (b.zone === 0 ? -1 : b.zone);
  return az - bz;
}

/** @param {number} sector */
function sectorRow(sector) { return Math.floor((sector - 1) / 3); }
/** @param {number} sector */
function sectorCol(sector) { return (sector - 1) % 3; }

/** @param {Loc} loc @returns {Loc[]} */
export function neighbors(loc) {
  /** @type {Loc[]} */
  const n = [];
  const s = loc.sector;
  const r = sectorRow(s);
  const c = sectorCol(s);

  if (loc.zone === 0) {
    // sector center connects to its 4 zones
    for (let z = 1; z <= 4; z++) n.push({ sector: s, zone: z });
  } else {
    // zone center connects to sector center
    n.push({ sector: s, zone: 0 });

    const z = loc.zone;

    // cross-sector links (ArenaPlan.md)
    // RIGHT: zone2->(s+1,z1), zone4->(s+1,z3)
    if (c < 2) {
      if (z === 2) n.push({ sector: s + 1, zone: 1 });
      if (z === 4) n.push({ sector: s + 1, zone: 3 });
    }
    // LEFT: symmetric
    if (c > 0) {
      if (z === 1) n.push({ sector: s - 1, zone: 2 });
      if (z === 3) n.push({ sector: s - 1, zone: 4 });
    }
    // DOWN: zone3->(s+3,z1), zone4->(s+3,z2)
    if (r < 2) {
      if (z === 3) n.push({ sector: s + 3, zone: 1 });
      if (z === 4) n.push({ sector: s + 3, zone: 2 });
    }
    // UP: symmetric
    if (r > 0) {
      if (z === 1) n.push({ sector: s - 3, zone: 3 });
      if (z === 2) n.push({ sector: s - 3, zone: 4 });
    }
  }

  n.sort(compareLoc);
  return n;
}

/**
 * BFS distances from goal.
 * @param {Loc} goal
 * @returns {Map<string, number>}
 */
export function distanceMap(goal) {
  const key = (/** @type {Loc} */l) => `${l.sector}:${l.zone}`;
  const dist = new Map();
  const q = [goal];
  dist.set(key(goal), 0);
  while (q.length) {
    const cur = q.shift();
    const dcur = dist.get(key(cur));
    for (const nb of neighbors(cur)) {
      const k = key(nb);
      if (!dist.has(k)) {
        dist.set(k, dcur + 1);
        q.push(nb);
      }
    }
  }
  return dist;
}

/**
 * Choose next step along a shortest path with deterministic tie-break.
 * @param {Loc} from
 * @param {Loc} to
 * @returns {Loc|null}
 */
export function nextStepToward(from, to) {
  if (locEq(from, to)) return null;
  const key = (/** @type {Loc} */l) => `${l.sector}:${l.zone}`;
  const dist = distanceMap(to);
  const dFrom = dist.get(key(from));
  if (dFrom == null) return null;
  const opts = neighbors(from);
  /** @type {Loc[]} */
  const candidates = [];
  for (const nb of opts) {
    const d = dist.get(key(nb));
    if (d != null && d === dFrom - 1) candidates.push(nb);
  }
  candidates.sort(compareLoc);
  return candidates[0] ?? null;
}

// ------------- Match init + step -------------

export const DEFAULT_RULESET = {
  rulesetVersion: "0.1.0-dev",
  schemaVersion: "0.1.0-dev",
  ticksPerSecond: 1,

  // Movement cooldown: Ruleset.md §1.2
  baseMoveCooldownOnMoveTicks: 0,
  perEquippedSlotMoveCooldownPenaltyTicks: 1,

  // Powerups: Ruleset.md §7
  powerupSpawnIntervalMinTicks: 10,
  powerupSpawnIntervalMaxTicks: 20,
  powerupHealthDelta: 25,
  powerupAmmoDelta: 25,
  powerupEnergyDelta: 25,

  // Walls: Ruleset.md §3
  wallBumpDamage: 1,

  // Bullets: CombatPlan.md (placeholders)
  bulletDamage: 10,
  bulletCostAmmo: 1,
  bulletCooldownOnUseTicks: 1,
  bulletTtlTicks: 8,

  // Bullet direction policy: CombatPlan.md §3.3
  bulletDirPolicy: "A", // A=vertical-first shortest path
};

/** @param {Loadout} loadout */
function equippedCount(loadout) {
  return (loadout.slot1 ? 1 : 0) + (loadout.slot2 ? 1 : 0) + (loadout.slot3 ? 1 : 0);
}

/** @param {MatchState} st */
function aliveBots(st) {
  return st.bots.filter(b => b.alive);
}

/** @param {BotState} bot */
function botSector(bot) { return bot.loc.sector; }

/** @param {BotId} id */
function botIdIndex(id) {
  return id === "BOT1" ? 1 : id === "BOT2" ? 2 : id === "BOT3" ? 3 : 4;
}

/** @param {BotState[]} bots */
function lowestBotId(bots) {
  return bots.slice().sort((a,b)=>botIdIndex(a.id)-botIdIndex(b.id))[0];
}

/**
 * Deterministic target selection: closest alive bot, ties => lowest bot id.
 * @param {MatchState} st
 * @param {BotState} self
 */
function selectClosestEnemy(st, self) {
  const alive = st.bots.filter(b => b.alive && b.id !== self.id);
  if (!alive.length) return null;
  const distFrom = distanceMap(self.loc);
  const key = (/** @type {Loc} */l) => `${l.sector}:${l.zone}`;
  let best = null;
  let bestD = Infinity;
  for (const b of alive) {
    const d = distFrom.get(key(b.loc));
    const dd = (d == null ? 999 : d);
    if (dd < bestD) {
      bestD = dd; best = b;
    } else if (dd === bestD && best) {
      if (botIdIndex(b.id) < botIdIndex(best.id)) best = b;
    }
  }
  return best;
}

/**
 * Bullet direction policy A (vertical-first shortest path) from CombatPlan.md.
 * @param {number} fromSector
 * @param {number} toSector
 */
function bulletDirA(fromSector, toSector) {
  const fr = sectorRow(fromSector), fc = sectorCol(fromSector);
  const tr = sectorRow(toSector), tc = sectorCol(toSector);
  const dr = tr - fr;
  const dc = tc - fc;
  if (dr < 0) return "UP";
  if (dr > 0) return "DOWN";
  if (dc < 0) return "LEFT";
  if (dc > 0) return "RIGHT";
  return "UP";
}

/** @param {number} sector @param {"UP"|"DOWN"|"LEFT"|"RIGHT"} dir */
function stepSector(sector, dir) {
  const r = sectorRow(sector);
  const c = sectorCol(sector);
  if (dir === "UP") return (r === 0 ? null : sector - 3);
  if (dir === "DOWN") return (r === 2 ? null : sector + 3);
  if (dir === "LEFT") return (c === 0 ? null : sector - 1);
  if (dir === "RIGHT") return (c === 2 ? null : sector + 1);
  return null;
}

function applyDamage(st, victim, amount, source, sourceBotId, kind, events) {
  if (!victim.alive) return;
  victim.health -= amount;
  if (victim.health < 0) victim.health = 0;

  const dmgEv = { type: "DAMAGE", victimBotId: victim.id, amount, source, kind };
  if (source === "BOT" && sourceBotId) {
    dmgEv.sourceBotId = sourceBotId;
    victim.lastDamageByBotId = sourceBotId;
  }
  events.push(dmgEv);

  if (victim.health <= 0) {
    victim.alive = false;
    const credited = victim.lastDamageByBotId;
    if (credited) {
      const killer = st.bots.find(b => b.id === credited);
      if (killer) killer.kills += 1;
    }
    events.push({ type: "BOT_DIED", victimBotId: victim.id, creditedBotId: credited ?? null });
  }
}

/**
 * Powerup spawn selection: stable enumeration of empty anchors.
 * @param {MatchState} st
 * @param {ReturnType<typeof createRng>} rng
 */
function attemptSpawnPowerup(st, rng, rules, events) {
  const anchors = enumerateAnchors();
  const empty = anchors.filter(a => !st.powerups.some(p => locEq(p.loc, a)));
  if (!empty.length) {
    st.spawnRemainingTicks = 1;
    return;
  }
  const loc = empty[rng.intInclusive(0, empty.length - 1)];

  const types = ["HEALTH", "AMMO", "ENERGY"];
  const type = types[rng.intInclusive(0, types.length - 1)];

  const p = { powerupId: st.nextPowerupId++, type, loc };
  st.powerups.push(p);
  events.push({ type: "POWERUP_SPAWN", powerupId: p.powerupId, type: p.type, loc: p.loc });
  st.spawnRemainingTicks = rng.intInclusive(rules.powerupSpawnIntervalMinTicks, rules.powerupSpawnIntervalMaxTicks);
}

// ---------------- BotInstructions v1 (minimal compiler + VM) ----------------

const BUILTIN_BOT2_SOURCE = `SET_MOVE_TO_BOT CLOSEST_BOT
LABEL LOOP
IF (HEALTH < 30 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 15 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
IF (HEALTH >= 30 && AMMO >= 15) DO SET_MOVE_TO_BOT CLOSEST_BOT
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 NEAREST_BOT
GOTO LOOP
`;

const BUILTIN_BOT3_SOURCE = `SET_MOVE_TO_SECTOR 1 ZONE 1
LABEL LOOP
IF (HEALTH < 40 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 20 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
IF (HEALTH >= 40 && AMMO >= 20) DO SET_MOVE_TO_SECTOR 1 ZONE 1
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 3) DO USE_SLOT1 WEAKEST_BOT
GOTO LOOP
`;

/** @typedef {{t:"ID"|"NUM"|"OP"|"PUNC", v:string}} ExprTok */

/** @typedef {{kind:"NUM", n:number}|{kind:"IDENT", name:string}|{kind:"CALL", name:string, args:ExprNode[]}|{kind:"UNARY", op:"!", expr:ExprNode}|{kind:"BINARY", op:string, left:ExprNode, right:ExprNode}} ExprNode */

/**
 * @typedef {{
 *  instructions: CompiledInstr[],
 *  pcToSourceLine: number[],
 * }} CompiledProgram
 */

/**
 * @typedef {{
 *  op: "NOP"|"GOTO"|"IF_GOTO"|"IF_DO"|"SET_MOVE_TO_BOT"|"SET_MOVE_TO_POWERUP"|"SET_MOVE_TO_SECTOR"|"USE_SLOT"|"INVALID",
 *  text: string,
 *  sourceLine: number,
 *  label?: string,
 *  targetPc?: number,
 *  expr?: ExprNode,
 *  inner?: CompiledInstr,
 *  botTarget?: string,
 *  powerupType?: string,
 *  sector?: number,
 *  zone?: number,
 *  slot?: 1|2|3,
 *  target?: any,
 * }} CompiledInstr
 */

/** @param {string} s */
function normalizeBotTargetToken(s) {
  if (s === "NEAREST_BOT") return "CLOSEST_BOT";
  if (s === "WEAKEST_BOT") return "LOWEST_HEALTH_BOT";
  if (s === "TARGET_CLOSEST_BOT") return "CLOSEST_BOT";
  return s;
}

/** @param {string} s */
function normalizePowerupTypeToken(s) {
  if (s === "HEALTH" || s === "AMMO" || s === "ENERGY") return s;
  return "";
}

/** @param {string} s */
function normalizeSlotToken(s) {
  if (s === "SLOT1" || s === "SLOT2" || s === "SLOT3") return s;
  return "";
}

/** @param {string} expr */
function tokenizeExpr(expr) {
  /** @type {ExprTok[]} */
  const out = [];
  let i = 0;
  const isIdStart = (c) => /[A-Za-z_]/.test(c);
  const isId = (c) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c) => /[0-9]/.test(c);
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }

    const two = expr.slice(i, i + 2);
    if (two === "&&" || two === "||" || two === "==" || two === "!=" || two === "<=" || two === ">=") {
      out.push({ t: "OP", v: two });
      i += 2;
      continue;
    }

    if (c === "<" || c === ">" || c === "!" ) {
      out.push({ t: "OP", v: c });
      i += 1;
      continue;
    }

    if (c === "(" || c === ")" || c === ",") {
      out.push({ t: "PUNC", v: c });
      i += 1;
      continue;
    }

    if (isDigit(c)) {
      let j = i + 1;
      while (j < expr.length && isDigit(expr[j])) j++;
      out.push({ t: "NUM", v: expr.slice(i, j) });
      i = j;
      continue;
    }

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < expr.length && isId(expr[j])) j++;
      out.push({ t: "ID", v: expr.slice(i, j) });
      i = j;
      continue;
    }

    return null;
  }
  return out;
}

/** @param {ExprTok[]} toks */
function parseExpr(toks) {
  let i = 0;

  const peek = () => toks[i];
  const take = () => toks[i++];

  const parsePrimary = () => {
    const t = peek();
    if (!t) return null;
    if (t.t === "NUM") { take(); return { kind: "NUM", n: Number(t.v) }; }
    if (t.t === "ID") {
      take();
      const name = t.v;
      const next = peek();
      if (next && next.t === "PUNC" && next.v === "(") {
        take(); // (
        /** @type {ExprNode[]} */
        const args = [];
        const close = peek();
        if (close && close.t === "PUNC" && close.v === ")") {
          take();
          return { kind: "CALL", name, args };
        }
        while (true) {
          const e = parseOr();
          if (!e) return null;
          args.push(e);
          const p = peek();
          if (p && p.t === "PUNC" && p.v === ",") { take(); continue; }
          const q = peek();
          if (q && q.t === "PUNC" && q.v === ")") { take(); break; }
          return null;
        }
        return { kind: "CALL", name, args };
      }
      return { kind: "IDENT", name };
    }
    if (t.t === "PUNC" && t.v === "(") {
      take();
      const e = parseOr();
      const c = peek();
      if (!e || !c || c.t !== "PUNC" || c.v !== ")") return null;
      take();
      return e;
    }
    return null;
  };

  const parseUnary = () => {
    const t = peek();
    if (t && t.t === "OP" && t.v === "!") {
      take();
      const e = parseUnary();
      if (!e) return null;
      return { kind: "UNARY", op: "!", expr: e };
    }
    return parsePrimary();
  };

  const parseCompare = () => {
    let left = parseUnary();
    if (!left) return null;
    while (true) {
      const t = peek();
      if (!t || t.t !== "OP") break;
      if (!["==","!=","<","<=",">",">="].includes(t.v)) break;
      const op = t.v;
      take();
      const right = parseUnary();
      if (!right) return null;
      left = { kind: "BINARY", op, left, right };
    }
    return left;
  };

  const parseAnd = () => {
    let left = parseCompare();
    if (!left) return null;
    while (true) {
      const t = peek();
      if (!t || t.t !== "OP" || t.v !== "&&") break;
      take();
      const right = parseCompare();
      if (!right) return null;
      left = { kind: "BINARY", op: "&&", left, right };
    }
    return left;
  };

  const parseOr = () => {
    let left = parseAnd();
    if (!left) return null;
    while (true) {
      const t = peek();
      if (!t || t.t !== "OP" || t.v !== "||") break;
      take();
      const right = parseAnd();
      if (!right) return null;
      left = { kind: "BINARY", op: "||", left, right };
    }
    return left;
  };

  const root = parseOr();
  if (!root) return null;
  if (i !== toks.length) return null;
  return root;
}

/**
 * @param {ExprNode} n
 * @param {{st:MatchState, bot:BotState, rules:any}} ctx
 */
function evalExprNode(n, ctx) {
  const truthy = (v) => (typeof v === "boolean" ? v : (v | 0) !== 0);
  const toNum = (v) => (typeof v === "number" ? v : truthy(v) ? 1 : 0);

  if (n.kind === "NUM") return { ok: true, v: n.n };
  if (n.kind === "IDENT") {
    if (n.name === "HEALTH") return { ok: true, v: ctx.bot.health };
    if (n.name === "AMMO") return { ok: true, v: ctx.bot.ammo };
    if (n.name === "ENERGY") return { ok: true, v: ctx.bot.energy };
    return { ok: false, v: 0 };
  }
  if (n.kind === "UNARY") {
    const r = evalExprNode(n.expr, ctx);
    if (!r.ok) return r;
    return { ok: true, v: !truthy(r.v) };
  }
  if (n.kind === "BINARY") {
    if (n.op === "&&") {
      const l = evalExprNode(n.left, ctx);
      if (!l.ok) return l;
      if (!truthy(l.v)) return { ok: true, v: false };
      const rr = evalExprNode(n.right, ctx);
      if (!rr.ok) return rr;
      return { ok: true, v: truthy(rr.v) };
    }
    if (n.op === "||") {
      const l = evalExprNode(n.left, ctx);
      if (!l.ok) return l;
      if (truthy(l.v)) return { ok: true, v: true };
      const rr = evalExprNode(n.right, ctx);
      if (!rr.ok) return rr;
      return { ok: true, v: truthy(rr.v) };
    }

    const l = evalExprNode(n.left, ctx);
    if (!l.ok) return l;
    const r = evalExprNode(n.right, ctx);
    if (!r.ok) return r;
    const a = toNum(l.v);
    const b = toNum(r.v);

    if (n.op === "==") return { ok: true, v: a === b };
    if (n.op === "!=") return { ok: true, v: a !== b };
    if (n.op === "<") return { ok: true, v: a < b };
    if (n.op === "<=") return { ok: true, v: a <= b };
    if (n.op === ">") return { ok: true, v: a > b };
    if (n.op === ">=") return { ok: true, v: a >= b };
    return { ok: false, v: 0 };
  }
  if (n.kind === "CALL") {
    const name = n.name;
    if (name === "POWERUP_EXISTS") {
      if (n.args.length !== 1) return { ok: false, v: false };
      const a0 = n.args[0];
      if (a0.kind !== "IDENT") return { ok: false, v: false };
      const ty = normalizePowerupTypeToken(a0.name);
      if (!ty) return { ok: false, v: false };
      return { ok: true, v: ctx.st.powerups.some(p => p.type === ty) };
    }
    if (name === "SLOT_READY") {
      if (n.args.length !== 1) return { ok: false, v: false };
      const a0 = n.args[0];
      if (a0.kind !== "IDENT") return { ok: false, v: false };
      const slot = normalizeSlotToken(a0.name);
      if (!slot) return { ok: false, v: false };

      const module = slot === "SLOT1" ? ctx.bot.loadout.slot1 : slot === "SLOT2" ? ctx.bot.loadout.slot2 : ctx.bot.loadout.slot3;
      const cd = slot === "SLOT1" ? ctx.bot.slotCooldownRemaining.slot1 : slot === "SLOT2" ? ctx.bot.slotCooldownRemaining.slot2 : ctx.bot.slotCooldownRemaining.slot3;
      if (!module) return { ok: true, v: false };
      if (cd !== 0) return { ok: true, v: false };
      if (module === "BULLET") return { ok: true, v: ctx.bot.ammo >= ctx.rules.bulletCostAmmo };
      return { ok: true, v: false };
    }
    if (name === "DIST_TO_CLOSEST_BOT") {
      if (n.args.length !== 0) return { ok: false, v: 999 };
      const tgt = selectClosestEnemy(ctx.st, ctx.bot);
      if (!tgt) return { ok: true, v: 999 };
      const d = (distanceMap(ctx.bot.loc).get(`${tgt.loc.sector}:${tgt.loc.zone}`) ?? 999);
      return { ok: true, v: d };
    }
    return { ok: false, v: 0 };
  }

  return { ok: false, v: 0 };
}

/**
 * @param {string} sourceText
 * @returns {CompiledProgram}
 */
function compileBotInstructionsV1(sourceText) {
  const lines = sourceText.split(/\n/);

  /** @type {Map<string, number>} */
  const labels = new Map();

  /** @type {CompiledInstr[]} */
  const instructions = [];
  /** @type {number[]} */
  const pcToSourceLine = [];

  const addInstr = (instr, srcLine) => {
    instructions.push(instr);
    pcToSourceLine.push(srcLine);
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const srcLine = idx + 1;
    const raw = lines[idx];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(";")) continue;

    if (trimmed.startsWith("LABEL ")) {
      const name = trimmed.slice(6).trim();
      if (name) labels.set(name, instructions.length + 1);
      continue;
    }

    const instr = parseInstructionLine(trimmed, srcLine);
    addInstr(instr, srcLine);
  }

  // Resolve labels
  for (const instr of instructions) {
    if ((instr.op === "GOTO" || instr.op === "IF_GOTO") && instr.label) {
      const target = labels.get(instr.label);
      if (target != null) {
        instr.targetPc = target;
      } else {
        instr.op = "INVALID";
      }
    }
  }

  return { instructions, pcToSourceLine };
}

/** @param {string} line @param {number} sourceLine */
function parseInstructionLine(line, sourceLine) {
  const text = line;

  if (line === "NOP") return { op: "NOP", text, sourceLine };

  if (line.startsWith("GOTO ")) {
    const label = line.slice(5).trim();
    if (!label) return { op: "INVALID", text, sourceLine };
    return { op: "GOTO", text, sourceLine, label };
  }

  if (line.startsWith("IF ")) {
    const rest = line.slice(3).trim();
    const idxGoto = rest.indexOf(" GOTO ");
    const idxDo = rest.indexOf(" DO ");

    if (idxGoto >= 0 && (idxDo < 0 || idxGoto < idxDo)) {
      const exprStr = rest.slice(0, idxGoto).trim();
      const label = rest.slice(idxGoto + 6).trim();
      const expr = compileExpr(exprStr);
      if (!expr || !label) return { op: "INVALID", text, sourceLine };
      return { op: "IF_GOTO", text, sourceLine, expr, label };
    }

    if (idxDo >= 0) {
      const exprStr = rest.slice(0, idxDo).trim();
      const innerStr = rest.slice(idxDo + 4).trim();
      const expr = compileExpr(exprStr);
      if (!expr || !innerStr) return { op: "INVALID", text, sourceLine };
      const inner = parseInstructionLine(innerStr, sourceLine);
      if (["GOTO","IF_GOTO","IF_DO"].includes(inner.op)) return { op: "INVALID", text, sourceLine };
      return { op: "IF_DO", text, sourceLine, expr, inner };
    }

    return { op: "INVALID", text, sourceLine };
  }

  if (line.startsWith("SET_MOVE_TO_BOT ")) {
    const tok = normalizeBotTargetToken(line.slice("SET_MOVE_TO_BOT ".length).trim());
    if (!tok) return { op: "INVALID", text, sourceLine };
    return { op: "SET_MOVE_TO_BOT", text, sourceLine, botTarget: tok };
  }

  if (line.startsWith("SET_MOVE_TO_POWERUP ")) {
    const ty = normalizePowerupTypeToken(line.slice("SET_MOVE_TO_POWERUP ".length).trim());
    if (!ty) return { op: "INVALID", text, sourceLine };
    return { op: "SET_MOVE_TO_POWERUP", text, sourceLine, powerupType: ty };
  }

  if (line.startsWith("SET_MOVE_TO_SECTOR ")) {
    const toks = line.split(/\s+/);
    // SET_MOVE_TO_SECTOR <S> [ZONE <Z>]
    if (toks.length !== 2 && toks.length !== 4) return { op: "INVALID", text, sourceLine };
    const sector = Number(toks[1]);
    if (!(sector >= 1 && sector <= 9)) return { op: "INVALID", text, sourceLine };
    if (toks.length === 2) {
      return { op: "SET_MOVE_TO_SECTOR", text, sourceLine, sector, zone: 0 };
    }
    if (toks[2] !== "ZONE") return { op: "INVALID", text, sourceLine };
    const zone = Number(toks[3]);
    if (!(zone >= 1 && zone <= 4)) return { op: "INVALID", text, sourceLine };
    return { op: "SET_MOVE_TO_SECTOR", text, sourceLine, sector, zone };
  }

  if (line.startsWith("USE_SLOT")) {
    const toks = line.split(/\s+/);
    if (toks.length !== 2) return { op: "INVALID", text, sourceLine };
    const slotTok = toks[0];
    const slot = slotTok === "USE_SLOT1" ? 1 : slotTok === "USE_SLOT2" ? 2 : slotTok === "USE_SLOT3" ? 3 : null;
    if (!slot) return { op: "INVALID", text, sourceLine };
    const targetTok = normalizeBotTargetToken(toks[1]);
    return { op: "USE_SLOT", text, sourceLine, slot, target: targetTok };
  }

  return { op: "INVALID", text, sourceLine };
}

/** @param {string} exprStr */
function compileExpr(exprStr) {
  const toks = tokenizeExpr(exprStr);
  if (!toks) return null;
  return parseExpr(toks);
}

/**
 * Execute exactly one instruction for this bot (or NOP if dead/invalid).
 * Invalid instruction => NOP + pc resets to 1 next tick.
 *
 * @param {{st:MatchState, bot:BotState, program:CompiledProgram, rules:any, events:ReplayEvent[], immediateMoves:Map<BotId, Loc|null>}} params
 */
function execBotTickV1(params) {
  const { st, bot, program, rules, events, immediateMoves } = params;

  const pcBefore = bot.pc;
  const instr = program.instructions[pcBefore - 1];

  if (!bot.alive) {
    events.push({ type: "BOT_EXEC", botId: bot.id, result: "NOP", reason: "DEAD", pcBefore, pcAfter: pcBefore });
    return;
  }

  if (!instr) {
    bot.pc = 1;
    events.push({ type: "BOT_EXEC", botId: bot.id, result: "NOP", reason: "INVALID_PC", pcBefore, pcAfter: bot.pc });
    return;
  }

  const ctx = { st, bot, rules };

  let pcAfter = pcBefore + 1;
  let fault = false;

  const doAction = (a) => {
    if (!a) return { ok: false, reason: "MALFORMED" };

    if (a.op === "NOP") return { ok: true };

    if (a.op === "SET_MOVE_TO_BOT") {
      bot.moveGoal = { kind: "BOT", target: a.botTarget };
      return { ok: true };
    }

    if (a.op === "SET_MOVE_TO_POWERUP") {
      bot.moveGoal = { kind: "POWERUP", type: a.powerupType };
      return { ok: true };
    }

    if (a.op === "SET_MOVE_TO_SECTOR") {
      bot.moveGoal = { kind: "LOC", loc: { sector: a.sector, zone: a.zone } };
      return { ok: true };
    }

    if (a.op === "USE_SLOT") {
      const slot = a.slot;
      const module = slot === 1 ? bot.loadout.slot1 : slot === 2 ? bot.loadout.slot2 : bot.loadout.slot3;
      const cd = slot === 1 ? bot.slotCooldownRemaining.slot1 : slot === 2 ? bot.slotCooldownRemaining.slot2 : bot.slotCooldownRemaining.slot3;

      if (!module || cd !== 0) return { ok: true };
      if (module === "BULLET") {
        if (bot.ammo < rules.bulletCostAmmo) return { ok: true };

        const resolved = resolveBotTargetToken(st, bot, a.target);
        if (!resolved) return { ok: true };

        bot.ammo -= rules.bulletCostAmmo;
        if (slot === 1) bot.slotCooldownRemaining.slot1 = rules.bulletCooldownOnUseTicks + 1;
        if (slot === 2) bot.slotCooldownRemaining.slot2 = rules.bulletCooldownOnUseTicks + 1;
        if (slot === 3) bot.slotCooldownRemaining.slot3 = rules.bulletCooldownOnUseTicks + 1;

        const dir = (rules.bulletDirPolicy === "A")
          ? bulletDirA(bot.loc.sector, resolved.loc.sector)
          : bulletDirA(bot.loc.sector, resolved.loc.sector);

        /** @type {Bullet} */
        const bullet = {
          bulletId: st.nextBulletId++,
          ownerBotId: bot.id,
          targetBotId: resolved.id,
          sector: bot.loc.sector,
          dir,
          ttlRemaining: rules.bulletTtlTicks,
        };
        st.bullets.push(bullet);
        events.push({ type: "BULLET_SPAWN", bulletId: bullet.bulletId, ownerBotId: bullet.ownerBotId, sector: bullet.sector, dir: bullet.dir });
        events.push({ type: "RESOURCE_DELTA", botId: bot.id, ammoDelta: -rules.bulletCostAmmo, energyDelta: 0, healthDelta: 0, cause: "USE_SLOT" });
        return { ok: true };
      }
      return { ok: true };
    }

    return { ok: false, reason: "UNKNOWN_OP" };
  };

  const execOne = () => {
    if (instr.op === "NOP") return { ok: true, reason: "NOP" };

    if (instr.op === "GOTO") {
      if (instr.targetPc == null) return { ok: false, reason: "BAD_LABEL" };
      pcAfter = instr.targetPc;
      return { ok: true, reason: "GOTO" };
    }

    if (instr.op === "IF_GOTO") {
      if (!instr.expr || instr.targetPc == null) return { ok: false, reason: "MALFORMED_IF" };
      const r = evalExprNode(instr.expr, ctx);
      if (!r.ok) return { ok: false, reason: "BAD_EXPR" };
      if (typeof r.v === "boolean" ? r.v : (r.v | 0) !== 0) pcAfter = instr.targetPc;
      return { ok: true, reason: "IF_GOTO" };
    }

    if (instr.op === "IF_DO") {
      if (!instr.expr || !instr.inner) return { ok: false, reason: "MALFORMED_IF" };
      const r = evalExprNode(instr.expr, ctx);
      if (!r.ok) return { ok: false, reason: "BAD_EXPR" };
      const cond = (typeof r.v === "boolean" ? r.v : (r.v | 0) !== 0);
      if (!cond) return { ok: true, reason: "IF_DO_FALSE" };
      const rr = doAction(instr.inner);
      if (!rr.ok) return rr;
      return { ok: true, reason: "IF_DO_TRUE" };
    }

    if (instr.op === "SET_MOVE_TO_BOT" || instr.op === "SET_MOVE_TO_POWERUP" || instr.op === "SET_MOVE_TO_SECTOR" || instr.op === "USE_SLOT") {
      return doAction(instr);
    }

    return { ok: false, reason: "INVALID_INSTR" };
  };

  const r = execOne();
  if (!r.ok) fault = true;

  if (fault) {
    bot.pc = 1;
    events.push({ type: "BOT_EXEC", botId: bot.id, result: "NOP", reason: "INVALID_INSTRUCTION", pcBefore, pcAfter: bot.pc, instr: instr.text, sourceLine: instr.sourceLine, detail: r.reason ?? null });
  } else {
    if (program.instructions.length > 0) {
      if (pcAfter < 1 || pcAfter > program.instructions.length) pcAfter = 1;
    } else {
      pcAfter = 1;
    }
    bot.pc = pcAfter;
    events.push({ type: "BOT_EXEC", botId: bot.id, result: "EXECUTED", reason: r.reason ?? null, pcBefore, pcAfter: bot.pc, instr: instr.text, sourceLine: instr.sourceLine });
  }
}

/**
 * @param {MatchState} st
 * @param {BotState} self
 * @param {string} tok
 */
function resolveBotTargetToken(st, self, tok) {
  const t = normalizeBotTargetToken(tok);
  if (t === "TARGET") {
    if (!self.targetBotId) return null;
    const b = st.bots.find(x => x.alive && x.id === self.targetBotId);
    return b ?? null;
  }
  if (t === "CLOSEST_BOT") return selectClosestEnemy(st, self);
  if (t === "LOWEST_HEALTH_BOT") return selectLowestHealthEnemy(st, self);
  if (t === "BOT1" || t === "BOT2" || t === "BOT3" || t === "BOT4") {
    const b = st.bots.find(x => x.alive && x.id === t);
    if (b && b.id !== self.id) return b;
    return null;
  }
  return null;
}

/**
 * Deterministic target selection: lowest health alive bot, ties => lowest bot id.
 * @param {MatchState} st
 * @param {BotState} self
 */
function selectLowestHealthEnemy(st, self) {
  const alive = st.bots.filter(b => b.alive && b.id !== self.id);
  if (!alive.length) return null;
  let best = alive[0];
  for (const b of alive) {
    if (b.health < best.health) best = b;
    else if (b.health === best.health && botIdIndex(b.id) < botIdIndex(best.id)) best = b;
  }
  return best;
}

/**
 * Resolve movement goal (if any) into a single anchor-step.
 * @param {MatchState} st
 * @param {BotState} bot
 */
function computeGoalMoveStep(st, bot) {
  if (!bot.moveGoal || !bot.alive) return null;

  if (bot.moveGoal.kind === "LOC") {
    const goalLoc = bot.moveGoal.loc;
    if (locEq(bot.loc, goalLoc)) {
      bot.moveGoal = null;
      return null;
    }
    return nextStepToward(bot.loc, goalLoc);
  }

  if (bot.moveGoal.kind === "POWERUP") {
    const type = bot.moveGoal.type;
    const candidates = st.powerups.filter(p => p.type === type);
    if (!candidates.length) {
      bot.moveGoal = null;
      return null;
    }

    const distFrom = distanceMap(bot.loc);
    const key = (/** @type {Loc} */l) => `${l.sector}:${l.zone}`;
    let best = candidates[0];
    let bestD = distFrom.get(key(best.loc)) ?? 999;
    for (const p of candidates) {
      const d = distFrom.get(key(p.loc)) ?? 999;
      if (d < bestD) { bestD = d; best = p; }
      else if (d === bestD && compareLoc(p.loc, best.loc) < 0) best = p;
    }
    return nextStepToward(bot.loc, best.loc);
  }

  if (bot.moveGoal.kind === "BOT") {
    const resolved = resolveBotTargetToken(st, bot, bot.moveGoal.target);
    if (!resolved) {
      bot.moveGoal = null;
      return null;
    }
    return nextStepToward(bot.loc, resolved.loc);
  }

  return null;
}

/**
 * @param {{matchSeed:number, tickCap:number, rules?:Partial<typeof DEFAULT_RULESET>}} params
 * @returns {Replay}
 */
export function createReplay(params) {
  const rules = { ...DEFAULT_RULESET, ...(params.rules ?? {}) };
  const rng = createRng(params.matchSeed);

  /** @type {BotState[]} */
  const bots = [
    {
      id: "BOT1",
      displayName: "BOT1",
      appearance: { kind: "COLOR", color: "#3b82f6" },
      loadout: { slot1: "BULLET", slot2: null, slot3: null },
      sourceText: BUILTIN_BOT2_SOURCE,
      loc: { sector: 1, zone: 1 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
      targetBotId: null,
      targetPowerupType: null,
      moveGoal: null,
      slotCooldownRemaining: { slot1: 0, slot2: 0, slot3: 0 },
      moveCooldownRemaining: 0,
      lastDamageByBotId: null,
      kills: 0,
      points: 0,
    },
    {
      id: "BOT2",
      displayName: "BOT2",
      appearance: { kind: "COLOR", color: "#ef4444" },
      loadout: { slot1: "BULLET", slot2: null, slot3: null },
      sourceText: BUILTIN_BOT2_SOURCE,
      loc: { sector: 3, zone: 2 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
      targetBotId: null,
      targetPowerupType: null,
      moveGoal: null,
      slotCooldownRemaining: { slot1: 0, slot2: 0, slot3: 0 },
      moveCooldownRemaining: 0,
      lastDamageByBotId: null,
      kills: 0,
      points: 0,
    },
    {
      id: "BOT3",
      displayName: "BOT3",
      appearance: { kind: "COLOR", color: "#22c55e" },
      loadout: { slot1: "BULLET", slot2: "ARMOR", slot3: null },
      sourceText: BUILTIN_BOT3_SOURCE,
      loc: { sector: 7, zone: 3 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
      targetBotId: null,
      targetPowerupType: null,
      moveGoal: null,
      slotCooldownRemaining: { slot1: 0, slot2: 0, slot3: 0 },
      moveCooldownRemaining: 0,
      lastDamageByBotId: null,
      kills: 0,
      points: 0,
    },
    {
      id: "BOT4",
      displayName: "BOT4",
      appearance: { kind: "COLOR", color: "#eab308" },
      loadout: { slot1: "BULLET", slot2: null, slot3: null },
      sourceText: BUILTIN_BOT2_SOURCE,
      loc: { sector: 9, zone: 4 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
      targetBotId: null,
      targetPowerupType: null,
      moveGoal: null,
      slotCooldownRemaining: { slot1: 0, slot2: 0, slot3: 0 },
      moveCooldownRemaining: 0,
      lastDamageByBotId: null,
      kills: 0,
      points: 0,
    },
  ];

  /** @type {Map<BotId, CompiledProgram>} */
  const programsByBotId = new Map();
  for (const b of bots) programsByBotId.set(b.id, compileBotInstructionsV1(b.sourceText));

  /** @type {MatchState} */
  const st = {
    tick: 0,
    rngState: rng.getState(),
    bots,
    bullets: [],
    powerups: [],
    spawnRemainingTicks: rng.intInclusive(rules.powerupSpawnIntervalMinTicks, rules.powerupSpawnIntervalMaxTicks),
    nextPowerupId: 1,
    nextBulletId: 1,
    winnerBotId: null,
    ended: false,
    endReason: null,
  };

  /** @type {ReplayHeader} */
  const header = {
    schemaVersion: rules.schemaVersion,
    rulesetVersion: rules.rulesetVersion,
    ticksPerSecond: rules.ticksPerSecond,
    matchSeed: params.matchSeed,
    tickCap: params.tickCap,
    bots: bots.map(b => ({
      id: b.id,
      displayName: b.displayName,
      appearance: b.appearance,
      loadout: b.loadout,
      sourceText: b.sourceText,
    })),
  };

  /** @type {any[]} */
  const state = [];
  /** @type {ReplayEvent[][]} */
  const events = [];

  const snapshot = () => JSON.parse(JSON.stringify({
    tick: st.tick,
    bots: st.bots,
    bullets: st.bullets,
    powerups: st.powerups,
    spawnRemainingTicks: st.spawnRemainingTicks,
    endReason: st.endReason,
    winnerBotId: st.winnerBotId,
  }));

  // state[0]
  state.push(snapshot());
  events.push([]);

  for (let t = 1; t <= params.tickCap; t++) {
    if (st.ended) break;
    st.tick = t;
    rng.setState(st.rngState);

    /** @type {ReplayEvent[]} */
    const ev = [];

    // Phase 1: Bot instruction phase (BotInstructions v1) — exactly one instruction per bot
    /** @type {Map<BotId, Loc|null>} */
    const immediateMoves = new Map();
    for (const bot of st.bots) immediateMoves.set(bot.id, null);

    for (const bot of st.bots) {
      const program = programsByBotId.get(bot.id) ?? { instructions: [], pcToSourceLine: [] };
      execBotTickV1({ st, bot, program, rules, events: ev, immediateMoves });
    }

    // Phase 2: Movement phase (goal movement runs even on non-movement instructions)
    for (const bot of st.bots) {
      if (!bot.alive) continue;

      const next = immediateMoves.get(bot.id) ?? computeGoalMoveStep(st, bot);
      if (!next) continue;

      const equipped = equippedCount(bot.loadout);
      const moveCooldownOnMoveTicks = rules.baseMoveCooldownOnMoveTicks + equipped * rules.perEquippedSlotMoveCooldownPenaltyTicks;

      if (bot.moveCooldownRemaining !== 0) continue;

      const occupied = st.bots.some(b => b.alive && b.id !== bot.id && locEq(b.loc, next));
      if (!occupied) {
        const fromLoc = bot.loc;
        bot.loc = next;
        bot.moveCooldownRemaining = moveCooldownOnMoveTicks + 1;
        ev.push({ type: "BOT_MOVED", botId: bot.id, fromLoc, toLoc: next });
      } else {
        const other = st.bots.find(b => b.alive && locEq(b.loc, next));
        ev.push({ type: "BUMP_BOT", botId: bot.id, otherBotId: other?.id ?? null });
      }
    }

    // Phase 4: Projectile updates (bullets)
    st.bullets.sort((a,b) => a.bulletId - b.bulletId);
    /** @type {Bullet[]} */
    const bulletsNext = [];
    for (const b of st.bullets) {
      if (b.ttlRemaining <= 0) {
        ev.push({ type: "BULLET_DESPAWN", bulletId: b.bulletId, reason: "TTL" });
        continue;
      }
      const nextSector = stepSector(b.sector, b.dir);
      if (nextSector == null) {
        ev.push({ type: "BULLET_DESPAWN", bulletId: b.bulletId, reason: "WALL" });
        continue;
      }
      const fromSector = b.sector;
      b.sector = nextSector;
      b.ttlRemaining -= 1;
      ev.push({ type: "BULLET_MOVE", bulletId: b.bulletId, fromSector, toSector: b.sector });

      // Hit resolution (after move): lowest bot id in the sector
      const victims = st.bots.filter(bt => bt.alive && botSector(bt) === b.sector);
      if (victims.length) {
        const victim = lowestBotId(victims);
        ev.push({ type: "BULLET_HIT", bulletId: b.bulletId, victimBotId: victim.id, damage: rules.bulletDamage });
        applyDamage(st, victim, rules.bulletDamage, "BOT", b.ownerBotId, "BULLET", ev);
        ev.push({ type: "BULLET_DESPAWN", bulletId: b.bulletId, reason: "HIT" });
        continue;
      }

      bulletsNext.push(b);
    }
    st.bullets = bulletsNext;

    // Phase 6: Pickups (BOT1..BOT4 ordering)
    const botOrder = ["BOT1","BOT2","BOT3","BOT4"];
    for (const bid of botOrder) {
      const bot = st.bots.find(b => b.id === bid);
      if (!bot || !bot.alive) continue;
      const idx = st.powerups.findIndex(p => locEq(p.loc, bot.loc));
      if (idx >= 0) {
        const p = st.powerups[idx];
        st.powerups.splice(idx, 1);
        let dh=0, da=0, de=0;
        if (p.type === "HEALTH") { dh = rules.powerupHealthDelta; bot.health = Math.min(100, bot.health + dh); }
        if (p.type === "AMMO") { da = rules.powerupAmmoDelta; bot.ammo = Math.min(100, bot.ammo + da); }
        if (p.type === "ENERGY") { de = rules.powerupEnergyDelta; bot.energy = Math.min(100, bot.energy + de); }
        if (bot.moveGoal && bot.moveGoal.kind === "POWERUP" && bot.moveGoal.type === p.type) bot.moveGoal = null;
        ev.push({ type: "POWERUP_PICKUP", botId: bot.id, powerupId: p.powerupId, type: p.type, loc: p.loc });
        ev.push({ type: "RESOURCE_DELTA", botId: bot.id, ammoDelta: da, energyDelta: de, healthDelta: dh, cause: `PICKUP_${p.type}` });
      }
    }

    // Phase 7: Deaths + win checks
    const aliveNow = aliveBots(st);
    if (aliveNow.length === 1) {
      st.ended = true;
      st.endReason = "LAST_ALIVE";
      st.winnerBotId = aliveNow[0].id;
    }

    // Phase 8: End-of-tick maintenance
    for (const bot of st.bots) {
      if (bot.moveCooldownRemaining > 0) bot.moveCooldownRemaining -= 1;
      if (bot.moveCooldownRemaining < 0) bot.moveCooldownRemaining = 0;

      if (bot.slotCooldownRemaining.slot1 > 0) bot.slotCooldownRemaining.slot1 -= 1;
      if (bot.slotCooldownRemaining.slot2 > 0) bot.slotCooldownRemaining.slot2 -= 1;
      if (bot.slotCooldownRemaining.slot3 > 0) bot.slotCooldownRemaining.slot3 -= 1;

      if (bot.targetBotId) {
        const alive = st.bots.some(b => b.alive && b.id === bot.targetBotId);
        if (!alive) bot.targetBotId = null;
      }

      if (bot.targetPowerupType) {
        const exists = st.powerups.some(p => p.type === bot.targetPowerupType);
        if (!exists) bot.targetPowerupType = null;
      }
    }

    // Powerup spawn timer
    st.spawnRemainingTicks = Math.max(0, st.spawnRemainingTicks - 1);
    if (st.spawnRemainingTicks === 0) {
      attemptSpawnPowerup(st, rng, rules, ev);
    }

    // Persist rng state
    st.rngState = rng.getState();

    // If tick cap reached without last-alive, end as draw
    if (!st.ended && t === params.tickCap) {
      st.ended = true;
      st.endReason = "TICK_CAP";
      st.winnerBotId = null;
    }

    // Final scoring (only once at end)
    if (st.ended) {
      // survivor bonus
      if (st.endReason === "LAST_ALIVE" && st.winnerBotId) {
        const w = st.bots.find(b => b.id === st.winnerBotId);
        if (w) w.points += 2;
      }
      // kill points
      for (const b of st.bots) b.points += b.kills;
      ev.push({ type: "MATCH_END", endReason: st.endReason, winnerBotId: st.winnerBotId });
      ev.push({ type: "SCORE", bots: st.bots.map(b => ({ botId: b.id, kills: b.kills, points: b.points, alive: b.alive })) });
    }

    // Snapshot
    state.push(snapshot());
    events.push(ev);
  }

  const result = {
    endReason: st.endReason ?? "TICK_CAP",
    winnerBotId: st.winnerBotId,
    bots: st.bots.map(b => ({ botId: b.id, kills: b.kills, points: b.points, alive: b.alive })),
  };

  return { header, state, events, result };
}

/**
 * Simple stable hash for UI comparison (not cryptographic).
 * @param {any} obj
 */
export function stableHash(obj) {
  const s = stableStringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Deterministic stringify with sorted keys.
 * @param {any} obj
 */
export function stableStringify(obj) {
  return JSON.stringify(obj, function (_k, v) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out = {};
      for (const key of Object.keys(v).sort()) out[key] = v[key];
      return out;
    }
    return v;
  });
}
