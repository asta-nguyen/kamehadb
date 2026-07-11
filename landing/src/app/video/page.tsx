import type { Metadata } from 'next';
import { NavBar } from '@/components/nav-bar';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Video Demo',
  description: 'See KamehaDB in action.',
  alternates: {
    canonical: '/video',
  },
};

export default function VideoPage() {
  return (
    <div className="min-h-screen bg-canvas font-sans antialiased flex flex-col">
      {/* Navigation */}
      <NavBar />

      {/* Content */}
      <main className="pt-32 pb-24 px-6 flex-grow flex flex-col items-center justify-center">
        <div className="max-w-4xl w-full mx-auto text-center">
          <h1 className="text-4xl font-extrabold text-ink tracking-tight mb-2">Video Demo</h1>
          <p className="text-lg text-body mb-12">See KamehaDB in action.</p>

          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 rounded-3xl blur-xl opacity-60" />
            <div className="bg-surface-strong rounded-3xl p-2 shadow-2xl shadow-amber-500/10 relative border border-slate-700/50">
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="bg-surface-strong rounded-2xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-900/30 to-slate-800" />
                <video
                  src="/kamehadb-demo.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="w-full h-auto relative"
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
