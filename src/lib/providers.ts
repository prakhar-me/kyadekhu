import type { Provider, RegionProviders } from './types';

export type Availability = 'Subscription' | 'Free' | 'Free with ads' | 'Rent' | 'Buy';

export interface ProviderOffer {
  provider: Provider;
  types: Availability[];
  homepage?: string;
}

/**
 * Official homepages for platforms common in India. These open the platform
 * itself; TMDB does not provide per-title deep links, so title-level links go
 * through the TMDB watch page (data from JustWatch).
 */
const HOMEPAGES: [RegExp, string][] = [
  [/netflix/i, 'https://www.netflix.com/in/'],
  [/amazon|prime video/i, 'https://www.primevideo.com/'],
  [/hotstar|jiohotstar/i, 'https://www.hotstar.com/in'],
  [/jio ?cinema/i, 'https://www.jiocinema.com/'],
  [/zee5/i, 'https://www.zee5.com/'],
  [/sony ?liv/i, 'https://www.sonyliv.com/'],
  [/apple tv/i, 'https://tv.apple.com/in'],
  [/google play/i, 'https://play.google.com/store/movies'],
  [/youtube/i, 'https://www.youtube.com/movies'],
  [/mubi/i, 'https://mubi.com/'],
  [/lionsgate/i, 'https://www.lionsgateplay.com/'],
  [/mx ?player/i, 'https://www.mxplayer.in/'],
  [/sun ?nxt/i, 'https://www.sunnxt.com/'],
  [/hoichoi/i, 'https://www.hoichoi.tv/'],
  [/eros ?now/i, 'https://erosnow.com/'],
  [/^aha$/i, 'https://www.aha.video/'],
  [/manorama ?max/i, 'https://www.manoramamax.com/'],
  [/shemaroo/i, 'https://www.shemaroome.com/'],
];

export const homepageFor = (name: string) => HOMEPAGES.find(([re]) => re.test(name))?.[1];

const ORDER: [keyof RegionProviders, Availability][] = [
  ['flatrate', 'Subscription'],
  ['free', 'Free'],
  ['ads', 'Free with ads'],
  ['rent', 'Rent'],
  ['buy', 'Buy'],
];

/** Groups a region's providers by platform, listing every way to watch on each. */
export function groupOffers(region: RegionProviders | undefined): ProviderOffer[] {
  if (!region) return [];
  const byId = new Map<number, ProviderOffer>();
  for (const [key, label] of ORDER) {
    const list = region[key];
    if (!Array.isArray(list)) continue;
    for (const provider of list) {
      const offer = byId.get(provider.provider_id) ?? {
        provider,
        types: [],
        homepage: homepageFor(provider.provider_name),
      };
      if (!offer.types.includes(label)) offer.types.push(label);
      byId.set(provider.provider_id, offer);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const rank = (o: ProviderOffer) => ORDER.findIndex(([, l]) => l === o.types[0]);
    return rank(a) - rank(b) || a.provider.display_priority - b.provider.display_priority;
  });
}
