/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the sync server. When unset, the app runs local-only and hides the sync UI. */
  readonly VITE_SYNC_URL?: string
}
