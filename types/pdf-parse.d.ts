declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFParseResult {
    text: string
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: Record<string, unknown>
    version: string
  }

  function pdf(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PDFParseResult>

  export default pdf
}