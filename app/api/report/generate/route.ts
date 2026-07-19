import { NextResponse } from 'next/server'

// Needs the Node.js runtime (not Edge) to run a headless browser.
export const runtime = 'nodejs'
// Vercel's default function timeout is 10s on Hobby — launching a browser
// and waiting for a full page (map + charts) to go network-idle routinely
// takes longer than that. 60 is the max allowed on Hobby without Fluid
// compute; raise it further if you're on Pro.
export const maxDuration = 60

// @sparticuz/chromium ships a Linux-only binary built for serverless
// functions — it does not run on a Windows/Mac dev machine. Locally we
// point puppeteer-core at the Chrome/Edge already installed on this
// machine instead (set PUPPETEER_EXECUTABLE_PATH in .env.local if it's
// not at the default path below). This avoids relying on the full
// `puppeteer` package's own ~300MB Chromium download, which is a common
// silent-failure point on Windows.
async function launchBrowser() {
  const { default: puppeteer } = await import('puppeteer-core')

  if (process.env.VERCEL) {
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

  return puppeteer.launch({ headless: true, executablePath })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const alertId = searchParams.get('alertId')
  const locale = searchParams.get('locale') || 'en'

  if (!alertId) {
    return NextResponse.json({ error: 'Missing alertId' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  if (!process.env.NEXT_PUBLIC_BASE_URL) {
    console.warn(
      'NEXT_PUBLIC_BASE_URL is not set — PDF route will try to reach localhost:3000 from the serverless function, which will fail in production. Set it to your deployed domain in Vercel env vars.'
    )
  }

  // The alert page is behind auth. Without forwarding the caller's session
  // cookie, Puppeteer hits the middleware's auth check with no session and
  // just renders the login screen into every PDF. Forward it explicitly.
  const cookieHeader = request.headers.get('cookie')

  let browser
  try {
    browser = await launchBrowser()

    const page = await browser.newPage()

    if (cookieHeader) {
      const cookies = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => {
          const idx = c.indexOf('=')
          return {
            name: c.slice(0, idx),
            value: c.slice(idx + 1),
            url: baseUrl,
          }
        })
      await page.setCookie(...cookies)
    }

    const targetUrl = `${baseUrl}/${locale}/dashboard/alerts/${alertId}`

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 45000 })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    })

    // Puppeteer's page.pdf() returns a Node Buffer; NextResponse expects a
    // BodyInit-compatible type, so convert explicitly rather than pass the
    // Buffer straight through.
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Post_Event_Report_${alertId}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDF Generation Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  } finally {
    if (browser) await browser.close()
  }
}
