/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' turns on the weekly ad auction; anything else shows "coming soon". */
  readonly VITE_ADS_LIVE?: string;
}
