import { toast } from 'sonner';

export function toastSuccess(message: string): void {
  toast.success(message, {
    style: {
      background: 'var(--success)',
      color: 'var(--success-foreground)',
    },
  });
}

export function toastError(message: string): void {
  toast.error(message, {
    style: {
      background: 'var(--destructive)',
      color: 'var(--destructive-foreground)',
    },
  });
}

export function toastInfo(message: string): void {
  toast.info(message, {
    style: {
      background: 'var(--info)',
      color: 'var(--info-foreground)',
    },
  });
}

export function toastWarning(message: string): void {
  toast.warning(message, {
    style: {
      background: 'var(--warning)',
      color: 'var(--warning-foreground)',
    },
  });
}

export { toast };
