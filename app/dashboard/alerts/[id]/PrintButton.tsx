'use client'

export default function PrintButton() {
  return (
    <button 
      onClick={() => window.print()}
      className="print:hidden ml-auto rounded border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-gray-50"
    >
      Download PDF Report
    </button>
  )
}
