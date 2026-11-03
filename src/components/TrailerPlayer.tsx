import { Play } from 'lucide-react';
import { useState } from 'react';
import type { Video } from '../lib/types';

/** Best YouTube video: official trailers first, then teasers, English/Hindi preferred. */
export function pickTrailer(videos: Video[] = []): Video | undefined {
  const yt = videos.filter((v) => v.site === 'YouTube' && v.key);
  const score = (v: Video) =>
    (v.type === 'Trailer' ? 8 : v.type === 'Teaser' ? 4 : 0) +
    (v.official ? 4 : 0) +
    (['en', 'hi'].includes(v.iso_639_1) ? 1 : 0);
  return yt.filter((v) => v.type === 'Trailer' || v.type === 'Teaser').sort((a, b) => score(b) - score(a))[0];
}

/** Click-to-play: shows the YouTube thumbnail until asked, then embeds the player inline. */
export function TrailerPlayer({ video, title }: { video?: Video; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (!video) {
    return (
      <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-line px-6 text-center">
        <div>
          <p className="display text-xl">No trailer available</p>
          <p className="mt-1 text-sm text-muted">TMDB doesn’t list an official trailer for {title} yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={`${title}: ${video.name}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Play trailer: ${video.name}`}
        >
          <img
            src={`https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-70 transition-opacity duration-300 group-hover:opacity-90"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-ink text-bg transition-transform duration-300 group-hover:scale-105 sm:h-20 sm:w-20">
              <Play size={26} className="ml-1 fill-current" />
            </span>
          </span>
          <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg/90 to-transparent p-4 text-left text-sm text-ink">
            {video.name}
          </span>
        </button>
      )}
    </div>
  );
}
