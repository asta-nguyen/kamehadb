import type { Metadata } from 'next';
import { NavBar } from '@/components/nav-bar';
import { TeamSection } from '@/components/team-section';
import { Footer } from '@/components/footer';
import { loadContributors } from '@/lib/contributors';

export const metadata: Metadata = {
  title: 'Team — KamehaDB',
  description: 'The developers behind KamehaDB. Open source, community-driven.',
  alternates: {
    canonical: '/team',
  },
};

export const revalidate = 86400;

export default async function TeamPage() {
  const contributors = await loadContributors(revalidate);

  return (
    <div className="min-h-screen bg-canvas font-sans antialiased flex flex-col">
      <NavBar />

      <main className="pt-20 flex-grow">
        <TeamSection contributors={contributors} />
      </main>

      <Footer />
    </div>
  );
}
