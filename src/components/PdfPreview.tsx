import { useMemo } from 'react'
import { proposalLayout, type ProposalPdfInput } from '../lib/proposal-pdf'

export function PdfPreview({ input }: { input: ProposalPdfInput }) {
  const layout = useMemo(() => proposalLayout(input), [input])
  return (
    <div className="pdf-fit">
      <article className="pdf-page is-cover" aria-label="Cover">
        <header className="pdf-hero">
          <span className="pdf-mark">{layout.cover.mark}</span>
          <small>{layout.cover.kind}</small>
          <h2>{layout.cover.title}</h2>
          <p>{layout.cover.brand}</p>
        </header>
        <div className="pdf-cards">
          <section>
            <small>Prepared for</small>
            <strong>{layout.cover.forLine}</strong>
          </section>
          <section>
            <small>Prepared by</small>
            <strong>{layout.cover.byLine}</strong>
            <p>{layout.cover.brand}</p>
          </section>
        </div>
        <footer className="pdf-meta">{[layout.cover.date, layout.cover.web].filter(Boolean).join('  |  ')}</footer>
      </article>
      {layout.pages.map((lines, index) => (
        <article className="pdf-page" key={index} aria-label={`Page ${index + 1} of ${layout.pages.length}`}>
          <header className="pdf-band">
            <span>{layout.cover.brand}</span>
            <span>
              Page {index + 1} of {layout.pages.length}
            </span>
          </header>
          <div className="pdf-body">
            {lines.map((line, lineIndex) =>
              line.head ? <h3 key={lineIndex}>{line.text}</h3> : <p key={lineIndex}>{line.text || '\u00a0'}</p>,
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
