import { domainOf, linePath } from '@/lib/charts'

const W = 300
const H = 80

export function Chart({
  testId,
  title,
  lines,
}: {
  testId: string
  title: string
  lines: { label: string; values: number[]; className: string }[]
}) {
  const domain = domainOf(...lines.map((l) => l.values))
  const empty = lines.every((l) => !l.values.length)
  return (
    <figure className="space-y-1" data-testid={testId}>
      <figcaption className="text-muted-foreground text-xs font-medium">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
        className="bg-muted/30 h-20 w-full rounded"
      >
        {lines.map((l) => (
          <path
            key={l.label}
            d={linePath(l.values, W, H, domain)}
            data-line={l.label}
            fill="none"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className={l.className}
          />
        ))}
      </svg>
      {lines.length > 1 && !empty && (
        <p className="flex gap-3 text-xs">
          {lines.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <i
                className={`inline-block h-0.5 w-3 bg-current ${l.className.replace('stroke-', 'text-')}`}
              />
              {l.label}
            </span>
          ))}
        </p>
      )}
    </figure>
  )
}
