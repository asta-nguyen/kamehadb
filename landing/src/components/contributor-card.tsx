'use client';

import { motion } from 'motion/react';
import { ArrowUpRight, GitCommitHorizontal, Globe2, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Contributor } from '@/lib/contributors';
import github from 'thesvg/github';

const FEATURED_CARD_OFFSETS = [
  'md:translate-y-8',
  'md:-translate-y-4',
  'md:translate-y-12',
  'md:translate-y-0',
] as const;

type ContributorCardProps = {
  readonly contributor: Contributor;
  readonly index: number;
  readonly isCore: boolean;
};

type MotionVariants = {
  readonly hidden: { readonly opacity: number; readonly y: number };
  readonly visible: { readonly opacity: number; readonly y: number };
};

export function GithubIcon({ className }: { readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-5 items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:fill-current',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: github.svg }}
    />
  );
}

export function ContributorAvatar({
  contributor,
  className,
}: {
  readonly contributor: Contributor;
  readonly className?: string;
}) {
  const displayName = contributor.name ?? contributor.login;

  return (
    <Avatar className={className}>
      <AvatarImage src={contributor.avatarUrl} alt={displayName} />
      <AvatarFallback className="rounded-lg bg-amber-500/10 font-bold text-amber-700 dark:text-amber-300">
        {getInitials(contributor)}
      </AvatarFallback>
    </Avatar>
  );
}

export function ContributorSpotlight({ contributor }: { readonly contributor: Contributor }) {
  const displayName = contributor.name ?? contributor.login;

  return (
    <Card className="h-full overflow-hidden rounded-lg border-border/70 bg-canvas/85 shadow-[var(--shadow-chromatic)] backdrop-blur-md dark:bg-surface-strong/80">
      <CardHeader className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge className="rounded-md border border-emerald-400/25 bg-emerald-400/10 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-emerald-700 shadow-none dark:text-emerald-300">
              Spotlight
            </Badge>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink">{displayName}</h2>
            <p className="font-mono text-sm text-muted">@{contributor.login}</p>
          </div>
          <ContributorAvatar
            contributor={contributor}
            className="size-20 rounded-lg border border-border shadow-[var(--shadow-soft-panel)]"
          />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <p className="min-h-20 text-pretty text-base leading-7 text-body">
          {contributor.bio ?? 'Building KamehaDB in public, one practical database workflow at a time.'}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ContributorFact
            icon={<GitCommitHorizontal className="size-4" />}
            label="Contributions"
            value={`${contributor.contributions.toLocaleString()} commits`}
          />
          <ContributorFact
            icon={<Globe2 className="size-4" />}
            label="Profile"
            value={contributor.company ?? contributor.blog ?? 'Open source'}
          />
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-3 px-5 pb-5">
        <Button
          asChild
          className="rounded-md bg-ink text-white hover:bg-ink/90 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          <a href={contributor.htmlUrl} target="_blank" rel="noopener noreferrer">
            <GithubIcon />
            GitHub profile
          </a>
        </Button>
        {contributor.blog && (
          <Button asChild variant="outline" className="rounded-md">
            <a href={normalizeUrl(contributor.blog)} target="_blank" rel="noopener noreferrer">
              <ArrowUpRight className="size-4" />
              Website
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function ContributorCard({
  contributor,
  index,
  isCore,
  fadeUp,
}: ContributorCardProps & { readonly fadeUp: MotionVariants }) {
  const displayName = contributor.name ?? contributor.login;
  const offsetClass = FEATURED_CARD_OFFSETS[index % FEATURED_CARD_OFFSETS.length];

  return (
    <motion.article variants={fadeUp} transition={{ duration: 0.5 }} className={cn('h-full', offsetClass)}>
      <Card className="group h-full overflow-hidden rounded-lg border-border/70 bg-canvas/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/40 hover:shadow-[var(--shadow-chromatic)] dark:bg-surface-strong/70">
        <CardHeader className="p-5">
          <div className="flex items-start gap-4">
            <ContributorAvatar contributor={contributor} className="size-16 rounded-lg border border-border" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-bold text-ink">{displayName}</h3>
                {isCore && (
                  <Badge className="rounded-md bg-amber-500 text-[0.65rem] uppercase tracking-[0.12em] text-white shadow-none">
                    Core
                  </Badge>
                )}
              </div>
              <p className="truncate font-mono text-xs text-muted">@{contributor.login}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-3">
          <p className="min-h-16 text-sm leading-6 text-body">
            {contributor.bio ?? 'Contributing practical fixes and sharp edges to the local-first database workspace.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge
              variant="secondary"
              className="rounded-md bg-amber-500/10 font-mono text-amber-700 dark:text-amber-300"
            >
              {contributor.contributions.toLocaleString()} commits
            </Badge>
            {contributor.location && (
              <Badge variant="outline" className="gap-1 rounded-md text-muted">
                <MapPin className="size-3" />
                {contributor.location}
              </Badge>
            )}
          </div>
        </CardContent>
        <CardFooter className="gap-3 px-5 pb-5">
          <a
            href={contributor.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-ink transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:text-amber-300"
            aria-label={`${displayName} on GitHub`}
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
          {contributor.blog && (
            <a
              href={normalizeUrl(contributor.blog)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md text-sm text-muted transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:text-amber-300"
              aria-label={`${displayName}'s website`}
            >
              Site
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </CardFooter>
      </Card>
    </motion.article>
  );
}

function ContributorFact({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-soft p-3 dark:bg-canvas/40">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        {icon}
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

export function EmptyTeamState() {
  return (
    <div className="mt-14 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 p-8 text-center">
      <GithubIcon className="mx-auto size-8 text-amber-700 dark:text-amber-300" />
      <h2 className="mt-4 text-2xl font-extrabold text-ink">GitHub contributor feed unavailable</h2>
      <p className="mx-auto mt-3 max-w-xl text-body">
        The team page still links straight to the repository while GitHub profile data is unavailable.
      </p>
    </div>
  );
}

function getInitials(contributor: Contributor): string {
  const displayName = contributor.name ?? contributor.login;
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `https://${url}`;
}
