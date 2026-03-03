// Deterministic engine (browser-safe) — inspired by repo specs.
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
      sourceText: "; builtin: chase+shoot (hardcoded)",
      loc: { sector: 1, zone: 1 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
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
      sourceText: "; builtin: chase+shoot (hardcoded)",
      loc: { sector: 3, zone: 2 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
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
      sourceText: "; builtin: bunker+shoot (hardcoded)",
      loc: { sector: 7, zone: 3 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
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
      sourceText: "; builtin: chase+shoot (hardcoded)",
      loc: { sector: 9, zone: 4 },
      alive: true,
      health: 100,
      ammo: 100,
      energy: 100,
      pc: 1,
      moveCooldownRemaining: 0,
      lastDamageByBotId: null,
      kills: 0,
      points: 0,
    },
  ];

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

    // Phase 1: Bot "instruction" phase (hardcoded AI for skeleton)
    for (const bot of st.bots) {
      if (!bot.alive) {
        ev.push({ type: "BOT_EXEC", botId: bot.id, result: "NOP", reason: "DEAD", pcBefore: bot.pc, pcAfter: bot.pc });
        continue;
      }

      // Movement intent: chase closest
      const target = selectClosestEnemy(st, bot);
      if (target) {
        const next = nextStepToward(bot.loc, target.loc);
        // Movement cooldown enforcement (Ruleset.md §1.2)
        const equipped = equippedCount(bot.loadout);
        const moveCooldownOnMoveTicks = rules.baseMoveCooldownOnMoveTicks + equipped * rules.perEquippedSlotMoveCooldownPenaltyTicks;

        if (next && bot.moveCooldownRemaining === 0) {
          // collision check (anchor occupancy)
          const occupied = st.bots.some(b => b.alive && b.id !== bot.id && locEq(b.loc, next));
          if (!occupied) {
            const fromLoc = bot.loc;
            bot.loc = next;
            bot.moveCooldownRemaining = moveCooldownOnMoveTicks + 1;
            ev.push({ type: "BOT_MOVED", botId: bot.id, fromLoc, toLoc: next });
          } else {
            // bump bot (no damage for now)
            const other = st.bots.find(b => b.alive && locEq(b.loc, next));
            ev.push({ type: "BUMP_BOT", botId: bot.id, otherBotId: other?.id ?? null });
          }
        }
      }

      // For this skeleton: emulate a simple weapon cooldown by using `pc` as a counter.
      // This is not the final DSL pc.
      if (bot.pc > 1) bot.pc -= 1;

      const tgt = selectClosestEnemy(st, bot);
      if (tgt) {
        const d = (distanceMap(bot.loc).get(`${tgt.loc.sector}:${tgt.loc.zone}`) ?? 999);
        const canFire = (bot.pc === 1) && bot.ammo >= rules.bulletCostAmmo && d <= 3;
        if (canFire) {
          bot.ammo -= rules.bulletCostAmmo;
          bot.pc = 1 + rules.bulletCooldownOnUseTicks;

          const dir = (rules.bulletDirPolicy === "A")
            ? bulletDirA(bot.loc.sector, tgt.loc.sector)
            : bulletDirA(bot.loc.sector, tgt.loc.sector);

          /** @type {Bullet} */
          const bullet = {
            bulletId: st.nextBulletId++,
            ownerBotId: bot.id,
            targetBotId: tgt.id,
            sector: bot.loc.sector,
            dir,
            ttlRemaining: rules.bulletTtlTicks,
          };
          st.bullets.push(bullet);
          ev.push({ type: "BULLET_SPAWN", bulletId: bullet.bulletId, ownerBotId: bullet.ownerBotId, sector: bullet.sector, dir: bullet.dir });
          ev.push({ type: "RESOURCE_DELTA", botId: bot.id, ammoDelta: -rules.bulletCostAmmo, energyDelta: 0, healthDelta: 0, cause: "FIRE_BULLET" });
        }
      }

      ev.push({ type: "BOT_EXEC", botId: bot.id, result: "EXECUTED", reason: "BUILTIN_AI", pcBefore: 1, pcAfter: bot.pc });
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
