type TableEditabilityNoticeProps = {
  readonly tone: 'info' | 'warning';
  readonly message: string;
};

export function TableEditabilityNotice({ tone, message }: TableEditabilityNoticeProps) {
  const className =
    tone === 'warning'
      ? 'mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-600 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400'
      : 'mb-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-700 dark:border-sky-800/40 dark:bg-sky-950/30 dark:text-sky-300';

  return <div className={className}>{message}</div>;
}
