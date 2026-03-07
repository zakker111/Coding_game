export type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'

export type ReplayAppearance = {
  kind: 'COLOR'
  color: string
}

export type ReplayHeaderBot = {
  slotId: SlotId
  displayName: string
  appearance: ReplayAppearance
  sourceText?: string
}

export type ReplayBotState = {
  botId: SlotId
  pos: { x: number; y: number }
  hp: number
  ammo: number
  /**
   * Optional in early MVP replays.
   * Viewer must treat missing energy as 0.
   */
  energy?: number
  alive: boolean
}

export type ReplayBulletState = {
  bulletId: string
  ownerBotId: SlotId
  pos: { x: number; y: number }
  vel: { x: number; y: number }
}

export type ReplayPowerupState = {
  powerupId: string
  type: 'HEALTH' | 'AMMO' | 'ENERGY'
  loc: { sector: number; zone: number }
  /** Optional explicit world position (if present, prefer over loc mapping). */
  pos?: { x: number; y: number }
}

export type ReplayTickState = {
  t: number
  bots: ReplayBotState[]
  bullets: ReplayBulletState[]
  powerups: ReplayPowerupState[]
}

export type Replay = {
  schemaVersion: string | number
  rulesetVersion: string
  ticksPerSecond: number
  matchSeed: number | string
  tickCap: number
  bots: ReplayHeaderBot[]
  state: ReplayTickState[]
  /**
   * Optional in early MVP mock replays.
   * When present, events[t] explain state[t-1] -> state[t].
   */
  events?: unknown[][]
}
