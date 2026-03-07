import { selectOpponents } from './opponents'

describe('selectOpponents', () => {
  it('returns 3 distinct opponent ids', () => {
    const picked = selectOpponents(12345)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
  })

  it('is deterministic given a seed', () => {
    const a = selectOpponents(12345)
    const b = selectOpponents(12345)
    expect(a).toEqual(b)
  })
})
