'use client';

import { motion } from 'motion/react';
import { HeartHandshake, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContributorAvatar,
  ContributorCard,
  ContributorSpotlight,
  EmptyTeamState,
  GithubIcon,
} from '@/components/contributor-card';
import type { Contributor } from '@/lib/contributors';

const CORE_CONTRIBUTOR_COUNT = 2;
const AVATAR_STACK_LIMIT = 9;

type TeamSectionProps = {
  readonly contributors: Contributor[];
};

type Metric = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

export function TeamSection({ contributors }: TeamSectionProps) {
  const totalContributions = contributors.reduce((sum, contributor) => sum + contributor.contributions, 0);
  const spotlightContributor = contributors[0] ?? null;
  const coreContributors = spotlightContributor ? contributors.slice(1, CORE_CONTRIBUTOR_COUNT + 1) : [];
  const communityContributors = spotlightContributor ? contributors.slice(CORE_CONTRIBUTOR_COUNT + 1) : contributors;
  const metrics: Metric[] = [
    { label: 'Contributors', value: contributors.length.toLocaleString(), detail: 'people in the repo graph' },
    { label: 'Commits', value: totalContributions.toLocaleString(), detail: 'public GitHub contributions' },
  ];

  return (
    <section id="team" className="relative overflow-hidden px-4 py-16 md:px-6 md:py-24">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(244,63,94,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(112deg,rgba(245,158,11,0.18),transparent_38%,rgba(52,211,153,0.11)_72%,transparent)]" />
      <div className="absolute left-0 top-28 h-px w-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-end"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.55 }}>
            <Badge className="mb-6 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-amber-700 shadow-none dark:text-amber-300">
              Open-source crew
            </Badge>
            <h1 className="max-w-4xl text-balance text-[clamp(3rem,8vw,6.75rem)] font-extrabold leading-[0.9] tracking-normal text-ink">
              The people shipping the local database workbench.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-body md:text-xl">
              KamehaDB is built in public by contributors who care about fast local tools, real database workflows, and
              fewer tabs between you and production data.
            </p>
          </motion.div>

          <motion.div
            className="relative rounded-lg border border-border/70 bg-canvas/75 p-4 shadow-[var(--shadow-chromatic)] backdrop-blur-md dark:bg-surface-strong/70"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-md border border-border/70 bg-surface-soft/80 p-4 dark:bg-canvas/40"
                >
                  <p className="font-mono text-2xl font-semibold tabular-nums text-ink">{metric.value}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{metric.label}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">{metric.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-amber-500/30 bg-amber-500/10 p-3">
              {contributors.slice(0, AVATAR_STACK_LIMIT).map((contributor) => (
                <ContributorAvatar
                  key={contributor.login}
                  contributor={contributor}
                  className="size-10 border-2 border-canvas shadow-sm"
                />
              ))}
              <span className="ml-1 font-mono text-xs uppercase tracking-[0.14em] text-muted">live from GitHub</span>
            </div>
          </motion.div>
        </motion.div>

        {spotlightContributor ? (
          <motion.div
            className="mt-14 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
              <ContributorSpotlight contributor={spotlightContributor} />
            </motion.div>
            <motion.div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2" variants={stagger}>
              {coreContributors.map((contributor, index) => (
                <ContributorCard
                  key={contributor.login}
                  contributor={contributor}
                  index={index}
                  isCore
                  fadeUp={fadeUp}
                />
              ))}
            </motion.div>
          </motion.div>
        ) : (
          <EmptyTeamState />
        )}

        {communityContributors.length > 0 && (
          <motion.div
            className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            {communityContributors.map((contributor, index) => (
              <ContributorCard
                key={contributor.login}
                contributor={contributor}
                index={index + CORE_CONTRIBUTOR_COUNT}
                isCore={false}
                fadeUp={fadeUp}
              />
            ))}
          </motion.div>
        )}

        <motion.div
          className="mt-16 grid gap-6 rounded-lg border border-border/70 bg-ink p-6 text-white shadow-[var(--shadow-soft-panel)] md:grid-cols-[1fr_auto] md:items-center md:p-8 dark:bg-surface-strong"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.45 }}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-amber-200">
              <HeartHandshake className="size-4" />
              Contribute
            </div>
            <h2 className="max-w-2xl text-balance text-3xl font-extrabold leading-tight md:text-4xl lg:text-5xl">
              Make the next database workflow less annoying.
            </h2>
            <p className="mt-4 max-w-2xl text-pretty leading-7 text-white/70">
              Add an engine, sharpen a query path, fix a packaged-app edge case, or improve the docs. The best team page
              is still the commit history.
            </p>
          </motion.div>

          <motion.div
            className="flex flex-col gap-3 sm:flex-row md:flex-col"
            variants={fadeUp}
            transition={{ duration: 0.45 }}
          >
            <Button
              asChild
              size="lg"
              className="h-12 rounded-md bg-amber-500 px-6 font-semibold text-white shadow-[var(--shadow-warm-glow)] transition-all hover:-translate-y-0.5 hover:bg-amber-600"
            >
              <a href="https://github.com/asta-nguyen/kamehadb" target="_blank" rel="noopener noreferrer">
                <GithubIcon />
                Contribute on GitHub
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-md border-white/20 bg-white/5 px-6 text-white transition-all hover:-translate-y-0.5 hover:bg-white/10 hover:text-white"
            >
              <a
                href="https://github.com/asta-nguyen/kamehadb/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Sparkles className="size-4" />
                Good first issues
              </a>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
