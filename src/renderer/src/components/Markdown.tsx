import { parseMarkdown, type Inline } from '@renderer/lib/markdown'

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'bold' ? (
          <strong key={i} className="font-semibold text-text">
            {p.text}
          </strong>
        ) : p.type === 'italic' ? (
          <em key={i}>{p.text}</em>
        ) : p.type === 'code' ? (
          <code key={i} className="rounded bg-bg px-1 py-0.5 font-mono text-[12px]">
            {p.text}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

/** Hiển thị Markdown đơn giản (React tự escape chữ, không có HTML thô). */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text)
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-text/90 select-text">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const size = b.level <= 2 ? 'text-[15px] mt-4' : 'text-[14px] mt-3'
          return (
            <h3 key={i} className={`${size} font-semibold text-text first:mt-0`}>
              <Inlines parts={b.inline} />
            </h3>
          )
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul'
          return (
            <Tag
              key={i}
              className={`space-y-1 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}
            >
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inlines parts={item} />
                </li>
              ))}
            </Tag>
          )
        }
        if (b.type === 'table') {
          return (
            <div key={i} className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    {b.header.map((h, j) => (
                      <th key={j} className="px-3 py-1.5 font-medium">
                        <Inlines parts={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {b.rows.map((row, r) => (
                    <tr key={r} className="align-top">
                      {row.map((c, j) => (
                        <td key={j} className="px-3 py-1.5">
                          <Inlines parts={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <p key={i}>
            <Inlines parts={b.inline} />
          </p>
        )
      })}
    </div>
  )
}
