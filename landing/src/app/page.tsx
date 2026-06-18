import type { Metadata } from 'next';
import HomeView from '../components/home-view';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export const revalidate = 86400;

async function loadGithubStars(): Promise<number | null> {
  try {
    const response = await fetch('https://api.github.com/repos/asta-nguyen/kamehadb', {
      next: { revalidate },
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export default async function Page() {
  const githubStars = await loadGithubStars();
  return <HomeView githubStars={githubStars} />;
}
