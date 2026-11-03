/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' turns on the weekly ad auction; anything else shows "coming soon". */
  readonly VITE_ADS_LIVE?: string;
  /** Public Web3Forms access key for the advertiser enquiry form (safe to expose). */
  readonly VITE_WEB3FORMS_ACCESS_KEY?: string;
}
