import type { MetadataRoute } from 'next';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { getBaseUrl } from '@/lib/url';

const LAST_MODIFIED = statSync(join(process.cwd(), '..', 'CHANGELOG.md')).mtime;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await getBaseUrl();
  return [
    {
      url: baseUrl,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/team`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/video`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
