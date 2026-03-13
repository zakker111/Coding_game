import { chromium } from 'playwright'

function parseArgs(argv) {
  let baseUrl = 'http://127.0.0.1:8787'
  let headless = true

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url' && argv[i + 1]) {
      baseUrl = argv[++i]
    } else if (a.startsWith('--url=')) {
      baseUrl = a.slice('--url='.length)
    } else if (a === '--headed') {
      headless = false
    }
  }

  baseUrl = baseUrl.replace(/\/$/, '')

  return { baseUrl, headless }
}

function formatLocation(loc) {
  if (!loc) return ''
  const bits = []
  if (loc.url) bits.push(loc.url)
  if (typeof loc.lineNumber === 'number') bits.push(`:${loc.lineNumber}`)
  if (typeof loc.columnNumber === 'number') bits.push(`:${loc.columnNumber}`)
  return bits.join('')
}

function asText(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.stack || err.message
  return String(err)
}

async function main() {
  const { baseUrl, headless } = parseArgs(process.argv.slice(2))

  const failures = []

  /** @type {Array<{text: string, location: string}>} */
  const consoleErrors = []
  /** @type {string[]} */
  const pageErrors = []
  /** @type {Array<{url: string, method: string, failure: string}>} */
  const requestFailures = []
  /** @type {Array<{url: string, status: number, statusText: string}>} */
  const badResponses = []

  /** @type {Array<{key: string, url: string, status: number, headers: Record<string, string>}>} */
  const keyResourceHeaders = []

  /**
   * Collect headers for these specific files to catch MIME issues (e.g. server
   * responding with text/html for a .js URL).
   */
  const keyPaths = [
    { key: 'workshop.js', path: '/workshop/workshop.js' },
    { key: 'engineRunner.worker.js', path: '/workshop/engineRunner.worker.js' },
    { key: 'engine/src/index.js', path: '/engine/src/index.js' },
  ]

  /** @type {Set<string>} */
  const recordedKeyPaths = new Set()

  /** @type {Array<{url: string, status: number, contentType: string}>} */
  const suspiciousJsResponses = []

  const assert = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  const browser = await chromium.launch({ headless })
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    consoleErrors.push({ text: msg.text(), location: formatLocation(msg.location()) })
  })

  page.on('pageerror', (err) => {
    pageErrors.push(asText(err))
  })

  page.on('requestfailed', (req) => {
    const f = req.failure()
    requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: f?.errorText || 'request failed',
    })
  })

  page.on('response', async (res) => {
    const url = res.url()

    let pathname = ''
    try {
      pathname = new URL(url).pathname
    } catch {
      return
    }

    for (const kp of keyPaths) {
      if (pathname !== kp.path) continue
      if (recordedKeyPaths.has(kp.key)) continue

      recordedKeyPaths.add(kp.key)
      keyResourceHeaders.push({
        key: kp.key,
        url,
        status: res.status(),
        headers: res.headers(),
      })
    }

    // Also capture any JS-like resources that came back as HTML or error codes.
    if (!pathname.endsWith('.js') && !pathname.endsWith('.mjs')) return

    const status = res.status()
    const headers = res.headers()
    const contentType = headers['content-type'] || ''

    if (status >= 400 || /\btext\/html\b/i.test(contentType)) {
      suspiciousJsResponses.push({ url, status, contentType })
    }
  })

  const workshopNoSlash = `${baseUrl}/workshop`
  const workshopSlash = `${baseUrl}/workshop/`

  console.log(`[qa:workshop] Loading ${workshopNoSlash}`)
  await page.goto(workshopNoSlash, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#runBtn')

  assert(page.url().endsWith('/workshop/'), `Expected redirect to trailing slash, got: ${page.url()}`)

  console.log(`[qa:workshop] Loading ${workshopSlash}`)
  await page.goto(workshopSlash, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#runBtn')

  // (2) Opponent selects populated
  for (const id of ['opponent2Select', 'opponent3Select', 'opponent4Select']) {
    const count = await page.locator(`#${id} option`).count()
    assert(count > 0, `Expected #${id} to have options, but it was empty.`)
  }

  // (3) Run / Preview produces a replay
  const scrubMaxBefore = Number((await page.getAttribute('#scrub', 'max')) || '0')

  console.log('[qa:workshop] Clicking Run / Preview')
  await page.click('#runBtn')

  await page.waitForFunction(() => {
    const el = document.getElementById('runBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const el = document.getElementById('scrub')
    return Number(el?.max || 0) > 0
  }, null, { timeout: 30_000 })

  const tickLabelText = (await page.locator('#tickLabel').innerText()).trim()
  const scrubMaxAfter = Number((await page.getAttribute('#scrub', 'max')) || '0')
  const runNoticeText = (await page.locator('#runNotice').innerText()).trim()
  const inspectText = (await page.locator('#inspectStats').innerText()).trim()

  const m = /tick\s+(\d+)\s*\/\s*(\d+)/i.exec(tickLabelText)
  const totalTicks = m ? Number(m[2]) : 0

  assert(totalTicks > 0, `Expected tick cap > 0 after run; got tick label: ${tickLabelText}`)
  assert(scrubMaxAfter > 0, `Expected scrub max > 0 after run; got: ${scrubMaxAfter}`)
  assert(scrubMaxAfter !== scrubMaxBefore, `Expected scrub max to update after run; before=${scrubMaxBefore} after=${scrubMaxAfter}`)
  assert(!/^Run failed:/i.test(runNoticeText), `Expected run to succeed, got notice: ${runNoticeText}`)
  assert(/\bHP\b/.test(inspectText) && /\bAmmo\b/.test(inspectText), `Expected inspector to show bot stats; got: ${inspectText}`)

  // (4) Randomize opponents changes selections and successfully runs
  const beforeOpponents = {
    BOT2: await page.inputValue('#opponent2Select'),
    BOT3: await page.inputValue('#opponent3Select'),
    BOT4: await page.inputValue('#opponent4Select'),
  }

  console.log('[qa:workshop] Clicking Randomize opponents')
  await page.click('#randomizeOpponentsBtn')

  await page.waitForFunction(() => {
    const el = document.getElementById('randomizeOpponentsBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const el = document.getElementById('runBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const text = document.getElementById('runNotice')?.textContent || ''
    return !/^Run failed:/i.test(text)
  }, null, { timeout: 30_000 })

  const afterOpponents = {
    BOT2: await page.inputValue('#opponent2Select'),
    BOT3: await page.inputValue('#opponent3Select'),
    BOT4: await page.inputValue('#opponent4Select'),
  }

  const changed =
    beforeOpponents.BOT2 !== afterOpponents.BOT2 ||
    beforeOpponents.BOT3 !== afterOpponents.BOT3 ||
    beforeOpponents.BOT4 !== afterOpponents.BOT4

  assert(
    changed,
    `Expected Randomize opponents to change at least one selection; before=${JSON.stringify(beforeOpponents)} after=${JSON.stringify(afterOpponents)}`
  )

  const runNoticeText2 = (await page.locator('#runNotice').innerText()).trim()
  assert(!/^Run failed:/i.test(runNoticeText2), `Expected randomize+run to succeed, got notice: ${runNoticeText2}`)

  await browser.close()

  // Reporting
  if (keyResourceHeaders.length) {
    console.log('\n[qa:workshop] Key resource response headers:')
    for (const r of keyResourceHeaders) {
      console.log(`- ${r.key}: ${r.status} ${r.url}`)
      console.log(JSON.stringify(r.headers, null, 2))
    }
  } else {
    console.log('\n[qa:workshop] Key resource response headers: (none captured)')
  }

  if (suspiciousJsResponses.length) {
    console.log('\n[qa:workshop] Suspicious JS responses (status>=400 or text/html):')
    for (const r of suspiciousJsResponses) {
      console.log(`- ${r.status} ${r.url} (content-type: ${r.contentType || '(none)'})`)
    }
  }

  if (consoleErrors.length) {
    console.log('\n[qa:workshop] Console errors:')
    for (const e of consoleErrors) {
      console.log(`- ${e.text}${e.location ? ` (${e.location})` : ''}`)
    }
  }

  if (pageErrors.length) {
    console.log('\n[qa:workshop] Unhandled page errors:')
    for (const e of pageErrors) console.log(`- ${e}`)
  }

  if (requestFailures.length) {
    console.log('\n[qa:workshop] Network request failures:')
    for (const r of requestFailures) {
      console.log(`- ${r.method} ${r.url}: ${r.failure}`)
    }
  }

  if (failures.length) {
    console.log('\n[qa:workshop] FAILURES:')
    for (const f of failures) console.log(`- ${f}`)
    process.exitCode = 1
  } else {
    console.log('\n[qa:workshop] OK')
  }
}

await main()
