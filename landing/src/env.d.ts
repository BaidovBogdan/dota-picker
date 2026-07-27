import "astro/client";

interface ImportMetaEnv {
  readonly PUBLIC_DOWNLOAD_URL?: string;
  readonly PUBLIC_BETA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
