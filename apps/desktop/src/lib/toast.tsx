import { toast } from 'sonner';

// Show clean toast notifications with no icon per user directive. (How / Why / What)
export function toastSuccess(message: string): void {
  toast.success(message, {
    icon: null,
    style: {
      background: 'var(--success)',
      color: 'var(--success-foreground)',
    },
  });
}

export function toastError(message: string): void {
  toast.error(message, {
    icon: null,
    style: {
      background: 'var(--destructive)',
      color: 'var(--destructive-foreground)',
    },
  });
}

export function toastInfo(message: string): void {
  toast.info(message, {
    icon: null,
    style: {
      background: 'var(--info)',
      color: 'var(--info-foreground)',
    },
  });
}

export function toastWarning(message: string): void {
  toast.warning(message, {
    icon: null,
    style: {
      background: 'var(--warning)',
      color: 'var(--warning-foreground)',
    },
  });
}

export { toast };
