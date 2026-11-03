import { ArrowUpRight } from 'lucide-react';
import { groupOffers } from '../lib/providers';
import { imageUrl } from '../lib/format';
import type { RegionProviders } from '../lib/types';

interface Props {
  region: RegionProviders | undefined;
  title: string;
}

/** Where to watch in India. Shows only what TMDB/JustWatch report; never guesses. */
export function StreamingProviders({ region, title }: Props) {
  const offers = groupOffers(region);

  return (
    <section aria-labelledby="watch-title">
      <h2 id="watch-title" className="section-title">
        Where to watch in India
      </h2>

      {offers.length === 0 ? (
        <p className="mt-4 text-muted">
          Availability information currently unavailable. {title} isn’t listed on any streaming, rental or purchase service
          in India right now.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {offers.map(({ provider, types, homepage }) => {
            const content = (
              <>
                <img
                  src={imageUrl(provider.logo_path, 'w92')}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-xl bg-raised object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{provider.provider_name}</span>
                  <span className="block text-sm text-muted">{types.join(', ')}</span>
                </span>
                {homepage && <ArrowUpRight size={18} className="shrink-0 text-muted transition-colors group-hover:text-accent" aria-hidden />}
              </>
            );
            return (
              <li key={provider.provider_id}>
                {homepage ? (
                  <a
                    href={homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-[64px] items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-white/30"
                    aria-label={`Open ${provider.provider_name} (${types.join(', ')})`}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="flex min-h-[64px] items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-sm text-faint">
        {region?.link && (
          <>
            <a href={region.link} target="_blank" rel="noopener noreferrer" className="text-link text-muted">
              Direct links for {title} on TMDB
            </a>
            <br />
          </>
        )}
        Availability data by JustWatch, via TMDB. Platform catalogues change often, so check before you subscribe.
      </p>
    </section>
  );
}
