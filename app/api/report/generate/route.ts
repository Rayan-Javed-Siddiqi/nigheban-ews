import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const alertId = searchParams.get('alertId')
  const locale = searchParams.get('locale') || 'en'

  if (!alertId) {
    return NextResponse.json({ error: 'Missing alertId' }, { status: 400 })
  }

  try {
    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // We navigate to the actual alert page. We assume it's running locally on port 3000
    // In production, this should be the absolute URL of the deployment
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const targetUrl = `${baseUrl}/${locale}/dashboard/alerts/${alertId}`
    
    // Set viewport to a standard A4 landscape or portrait size roughly
    await page.setViewport({ width: 1200, height: 800 })
    
    // Navigate and wait for network to be idle so all charts/maps load
    await page.goto(targetUrl, { waitUntil: 'networkidle0' })
    
    // Inject a print stylesheet dynamically if needed or just rely on existing print CSS
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      }
    })
    
    await browser.close()
    
    // Return PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Post_Event_Report_${alertId}.pdf"`
      }
    })
  } catch (error) {
    console.error('PDF Generation Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
