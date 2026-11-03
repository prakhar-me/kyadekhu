import { Link } from 'react-router-dom';

interface Props {
  /** Always shown so sponsored content is clearly marked. */
  label?: string;
  text?: string;
  linkText?: string;
  /** Internal path (e.g. /advertise) or an advertiser's external URL. */
  href?: string;
}

/**
 * A quiet, single-row sponsored slot. Defaults to the "advertise here" house
 * ad; pass an advertiser's text and URL to run a real one in the same style.
 */
export function AdSlot({
  label = 'Sponsored',
  text = 'Your brand could be here. Reach people deciding what to watch tonight.',
  linkText = 'Place your ad',
  href = '/advertise',
}: Props) {
  const external = /^https?:\/\//.test(href);
  const className =
    'group flex flex-col gap-1.5 rounded-3xl border border-dashed border-white/[0.13] px-5 py-[14px] text-[14px] leading-snug text-muted transition-colors duration-150 hover:border-solid hover:border-white/25 sm:flex-row sm:items-center sm:gap-4 sm:rounded-full sm:px-6';

  const content = (
    <>
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="min-w-0 flex-1">{text}</span>
      <span className="shrink-0 text-ink/80 transition-colors duration-150 group-hover:text-ink">
        {linkText}{' '}
        <span aria-hidden className="inline-block transition-transform duration-150 group-hover:translate-x-[2px]">
          →
        </span>
      </span>
    </>
  );

  return (
    <aside aria-label={label}>
      {external ? (
        <a href={href} target="_blank" rel="sponsored noopener noreferrer" className={className}>
          {content}
        </a>
      ) : (
        <Link to={href} className={className}>
          {content}
        </Link>
      )}
    </aside>
  );
}
