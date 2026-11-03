import { useState } from 'react';
import { imageUrl, posterSrcSet } from '../lib/format';

interface Props {
  path: string | null | undefined;
  title: string;
  sizes?: string;
  eager?: boolean;
  className?: string;
}

/** 2:3 poster with responsive sources, lazy loading and a typographic fallback. */
export function Poster({ path, title, sizes = '(min-width: 1024px) 18vw, (min-width: 640px) 30vw, 46vw', eager, className = '' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = path && !failed;

  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface ${showImage && !loaded ? 'skeleton' : ''} ${className}`}>
      {showImage ? (
        <img
          src={imageUrl(path, 'w342')}
          srcSet={posterSrcSet(path)}
          sizes={sizes}
          alt={`Poster for ${title}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="img-fade absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-end p-4">
          <span className="display text-lg leading-tight text-muted">{title}</span>
        </div>
      )}
    </div>
  );
}
