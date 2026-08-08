import { createHash } from 'node:crypto';

export type PortraitCatalogEntry = {
  id: number;
  slug: string;
  name: string;
};

export function normalizePortraitCatalog(
  heroes: readonly PortraitCatalogEntry[],
): PortraitCatalogEntry[] {
  return heroes.map(({ id, slug, name }) => ({ id, slug, name }));
}

export function portraitCatalogSha256(
  heroes: readonly PortraitCatalogEntry[],
) {
  return createHash('sha256')
    .update(JSON.stringify(normalizePortraitCatalog(heroes)))
    .digest('hex');
}
