export type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'

export type Pos = { x: number; y: number }

export type MoveDir =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT'

export type ReplayAppearance = { kind: 'COLOR'; color: string }

export type ReplayHeaderBot = {
  slotId: SlotId
  displayName: string
  appearance: ReplayAppearance
  sourceText?: string
}

export type ReplayBotState = {
  botId: SlotId
  pos: Pos
  hp: number
  ammo: number
  energy: number
  alive: boolean
  pc: number
}

export type ReplayBulletState = {
  bulletId: string
  ownerBotId: SlotId
  pos: Pos
  vel: Pos
}

export type ReplayTickState = {
  t: number
  bots: ReplayBotState[]
  bullets: ReplayBulletState[]
  powerups: any[]
}

export type ReplayEvent = { type: string; [key: string]: any }

export type Replay = {
  schemaVersion: string
  rulesetVersion: string
  ticksPerSecond: number
  matchSeed: number | string
  tickCap: number
  bots: ReplayHeaderBot[]
  state: ReplayTickState[]
  events: ReplayEvent[][]
}
