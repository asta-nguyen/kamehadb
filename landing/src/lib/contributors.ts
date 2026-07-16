export type Contributor = {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  blog: string | null;
  company: string | null;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
};

export async function loadContributors(revalidate: number): Promise<Contributor[]> {
  // A short helper to fetch with a timeout
  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
    try {
      return await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return null;
    }
  };

  try {
    const contributorsResponse = await fetchWithTimeout(
      'https://api.github.com/repos/asta-nguyen/kamehadb/contributors?per_page=100',
      {
        next: { revalidate },
        headers: { Accept: 'application/vnd.github+json' },
      },
      2500,
    );

    if (!contributorsResponse || !contributorsResponse.ok) return [];

    const contributors = (await contributorsResponse.json()) as Array<{
      login: string;
      avatar_url: string;
      html_url: string;
      contributions: number;
    }>;

    const profiles = [];
    for (let i = 0; i < contributors.length; i += 10) {
      const chunk = contributors.slice(i, i + 10);
      const chunkProfiles = await Promise.all(
        chunk.map(async (c) => {
          const fallback = {
            login: c.login,
            name: null,
            bio: null,
            location: null,
            blog: null,
            company: null,
            avatarUrl: c.avatar_url,
            htmlUrl: c.html_url,
            contributions: c.contributions,
          };

          try {
            const profileRes = await fetchWithTimeout(
              `https://api.github.com/users/${c.login}`,
              {
                next: { revalidate },
                headers: { Accept: 'application/vnd.github+json' },
              },
              1500,
            );
            if (!profileRes || !profileRes.ok) return fallback;
            const profile = (await profileRes.json()) as {
              name: string | null;
              bio: string | null;
              location: string | null;
              blog: string | null;
              company: string | null;
            };
            return {
              ...fallback,
              name: profile.name,
              bio: profile.bio,
              location: profile.location,
              blog: profile.blog,
              company: profile.company,
            };
          } catch {
            return fallback;
          }
        }),
      );
      profiles.push(...chunkProfiles);
    }

    return profiles;
  } catch {
    return [];
  }
}
