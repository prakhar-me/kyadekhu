import { Link } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { useAsync } from '../hooks/useAsync';
import { fetchAdStatus } from '../lib/ads';
import { formatINR } from '../lib/adRules';
import { SearchBar } from '../components/SearchBar';
import { SurpriseButton } from '../components/SurpriseMe';

const EXAMPLES = ['Ludo', 'Interstellar', 'Zindagi Na Milegi Dobara', 'Feel-good', 'Mind-bending', 'Thriller'];

export function HomePage() {
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col justify-center pb-16 pt-10 sm:pt-6">
      <section className="frame">
        <div className="page">
          <div className="mx-auto max-w-3xl border-x border-line px-4 py-14 sm:px-10 sm:py-20">
            <p className="rise -rotate-2 font-hand text-[1.75rem] leading-none text-muted sm:text-[2rem]">
              kya dekhu? — what should I watch?
            </p>
            <h1 className="rise display mt-4 text-[3rem] leading-[0.95] sm:text-[5rem] lg:text-[5.6rem]" style={{ animationDelay: '60ms' }}>
              Find your next favourite movie.
            </h1>

            <div className="rise mt-10 sm:mt-12" style={{ animationDelay: '140ms' }}>
              <SearchBar variant="hero" autoFocus={window.matchMedia?.('(pointer: fine)').matches} />
              <p className="mt-5 max-w-xl pl-1 text-[15px] leading-relaxed text-muted">
                Know what you want to watch? Type a movie name or genre. We’ll find your next watch.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-8 sm:flex-row sm:items-start sm:justify-between sm:px-10">
          <ul className="flex flex-wrap gap-2" aria-label="Try searching">
            {EXAMPLES.map((q) => (
              <li key={q}>
                <Link to={`/search?q=${encodeURIComponent(q)}`} className="pill">
                  {q}
                </Link>
              </li>
            ))}
          </ul>
          <SurpriseButton className="shrink-0 self-start" />
        </div>
        <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-10 sm:pt-24">
          <HomeAd />
        </div>
      </div>
    </div>
  );
}

/** This week's paid, approved ad, or the "advertise here" slot with the current bid. */
function HomeAd() {
  const status = useAsync(() => fetchAdStatus(), []);
  const live = status.data?.live;
  if (live) return <AdSlot text={live.text} linkText={live.brand} href={live.url} />;
  const highest = status.data?.next.highest;
  const note = status.data ? (highest ? `Current bid: ${formatINR(highest)}` : `Bids start at ${formatINR(status.data.next.minBid)}`) : undefined;
  return <AdSlot note={note} />;
}
