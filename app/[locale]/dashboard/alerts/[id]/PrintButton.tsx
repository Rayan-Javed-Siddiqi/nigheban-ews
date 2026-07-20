'use client'

export default function PrintButton({
  alertId,
  locale,
  disabled,
}: {
  alertId: string
  locale: string
  disabled?: boolean
}) {
  const handleDownload = () => {
    window.open(`/api/report/generate?alertId=${alertId}&locale=${locale}`, '_blank')
  }

  return (
    <button
      onClick={handleDownload}
      disabled={disabled}
      className="print:hidden ml-auto rounded border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Download Post-Event PDF
    </button>
  )
}
