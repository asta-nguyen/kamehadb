import { toast } from 'sonner';

export function toastSuccess(message: string) {
  toast.success(message, {
    style: {
      background: 'var(--success)',
      color: 'var(--success-foreground)',
    },
  });
}

export function toastError(message: string) {
  toast.error(message, {
    style: {
      background: 'var(--destructive)',
      color: 'var(--foreground)',
    },
  });
}

export function toastInfo(message: string) {
  toast.info(message, {
    style: {
      background: 'var(--info)',
      color: 'var(--info-foreground)',
    },
  });
}

export function toastWarning(message: string) {
  toast.warning(message, {
    style: {
      background: 'var(--warning)',
      color: 'var(--warning-foreground)',
    },
  });
}

export { toast };
