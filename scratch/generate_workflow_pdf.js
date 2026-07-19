const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const outPath = path.join(__dirname, 'nigheban-overall-workflow-report.pdf')

const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true })
const stream = fs.createWriteStream(outPath)
doc.pipe(stream)

function title(text) {
  doc
    .fillColor('#0f6b3d')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(text, { align: 'left' })
    .moveDown(0.4)
}

function heading(text) {
  doc
    .fillColor('#122018')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(text)
    .moveDown(0.25)
}

function paragraph(text) {
  doc
    .fillColor('#122018')
    .font('Helvetica')
    .fontSize(10.5)
    .text(text, { width: 510, lineGap: 3 })
    .moveDown(0.35)
}

function bullet(text) {
  doc
    .fillColor('#122018')
    .font('Helvetica')
    .fontSize(10.5)
    .text(`• ${text}`, { indent: 14, width: 500, lineGap: 3 })
}

function section(lines) {
  lines.forEach((line) => bullet(line))
  doc.moveDown(0.3)
}

doc
  .fillColor('#52615a')
  .font('Helvetica')
  .fontSize(9)
  .text('Nigheban EWS - Overall Workflow Report', { align: 'right' })
  .moveDown(0.8)

title('Nigheban EWS - Overall Workflow Report')
paragraph('This document summarizes the workflow already implemented in the current workspace and maps it to the MVP guide. It focuses on what has been built: ingest, normalize, monitor, review, disseminate, acknowledge, and audit.')

heading('What is built')
section([
  'Supabase-backed auth, roles, district boundaries, and operational tables.',
  'Provincial dashboard with a live MapLibre map, advisories, source health, and hazard overlays.',
  'Station health module with online / degraded / offline status and offline maintenance ticket automation.',
  'Alert candidate review, CAP composer, approval flow, CAP JSON/XML exports, and audit timeline.',
  'Dissemination board with dry-run channel breakdown and acknowledgement simulation.',
  'Ingest routes for USGS, Open-Meteo, Open-Meteo flood, FIRMS, IRSA, PMD snapshot, drought, glacial lakes, districts, hazards, and station simulation.',
])

heading('Workflow built')
section([
  'Ingest: external feeds and simulated telemetry enter through route handlers and cron jobs.',
  'Normalize: data is written into Supabase tables and views such as hazard events, flood forecasts, station health, advisories, and ingest status.',
  'Monitor: the provincial console surfaces live hazard layers, advisories, district drill-downs, and source freshness indicators.',
  'Review: alert candidates are reviewed in the dashboard, edited in CAP fields, and approved or dismissed by role.',
  'Disseminate: issued alerts flow into the dissemination board with per-channel recipient counts and dry-run dispatch.',
  'Acknowledge: simulated realtime updates advance deliveries through queued, sent, delivered, failed, and acknowledged states.',
  'Audit: actions are logged to the audit trail and visible in the system audit view.',
])

heading('Module status')
section([
  'Provincial dashboard: complete.',
  'Station health: complete.',
  'Alert composer: complete.',
  'Dissemination: complete for demo.',
  'Audit trail: partial, because the PDF post-event report generator is not yet built.',
  'Replay mode: missing.',
  'Localization: partial, because Urdu fields exist but the app-wide RTL / i18n scaffold is not complete.',
  'Full source matrix: partial, because several MVP sources are still not integrated.',
])

heading('Key gaps versus MVP')
section([
  'Google Flood API, GloFAS WMS-T, NDMA scraping, CHIRPS / SPI, NOAA VHI, and replay mode are still missing.',
  'App-wide Urdu / RTL layout and next-intl style localization scaffolding are still missing.',
  'A dedicated post-event PDF report generator and a fully authoritative schema snapshot are still missing.',
  'Real external dissemination integrations are still missing; the current flow is a dry-run simulation.',
])

heading('Current technical flow')
paragraph('The current system already works as an operational loop: source feeds and simulations are ingested into Supabase, the dashboard exposes the live picture, station health and hazard layers identify what needs attention, analysts move candidates through CAP approval, dissemination creates delivery rows, acknowledgement updates stream back in realtime, and the audit log records key transitions.')
paragraph('In practice, this already demonstrates the core day-to-day workflow of an early warning console, even though the broader MVP still needs the remaining sources, replay mode, and localization work.')

doc.end()

stream.on('finish', () => {
  console.log(`Wrote PDF to ${outPath}`)
})
