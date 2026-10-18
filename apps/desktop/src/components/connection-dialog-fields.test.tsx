import { renderToStaticMarkup } from 'react-dom/server';
import { useRef } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { CreateConnectionProfileInput, DbKind } from '@kamehadb/shared';
import { KIND } from '@/lib/kinds';
import { SSL_KINDS } from '@/lib/constants';
import { ConnectionDetailsSection, loadRootCACertificateFile } from './connection-dialog-fields';

const storeMocks = vi.hoisted(() => ({
  openNewQueryTab: vi.fn(),
  openGraphTab: vi.fn(),
  openDatabaseStatsTab: vi.fn(),
  openSchemaTimelineTab: vi.fn(),
  openMongoQueryTab: vi.fn(),
  openMongoShellTab: vi.fn(),
  openRedisQueryTab: vi.fn(),
  openRedisTab: vi.fn(),
  appStore: { state: { activeMongoDatabase: null as string | null } },
}));

vi.mock('@/store', () => storeMocks);

// Server-render the fields so these tests work in Vitest's current Node-only setup.
function renderFields(kind: DbKind, ssl: boolean, sslCaCert?: string) {
  let form: UseFormReturn<CreateConnectionProfileInput> | undefined;

  function Harness() {
    const currentForm = useForm<CreateConnectionProfileInput>({
      defaultValues: { name: 'test', kind, ssl, sslCaCert },
    });
    form = currentForm;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const rootCAInputRef = useRef<HTMLInputElement>(null);

    return (
      <ConnectionDetailsSection
        form={currentForm}
        kind={kind}
        onUrlChange={() => {}}
        fileInputRef={fileInputRef}
        rootCAInputRef={rootCAInputRef}
        isEditing
      />
    );
  }

  const html = renderToStaticMarkup(<Harness />);
  if (!form) throw new Error('form was not initialized');
  return { html, form };
}

describe('ConnectionDetailsSection Root CA', () => {
  it('shows SSL and Root CA controls only for supported database kinds', () => {
    for (const kind of SSL_KINDS) {
      const { html } = renderFields(kind, true, 'saved-root-ca');
      expect(html).toContain('Use SSL');
      expect(html).toContain('Root CA PEM');
    }

    const { html } = renderFields(KIND.ORACLE, true, 'saved-root-ca');
    expect(html).not.toContain('Use SSL');
    expect(html).not.toContain('Root CA PEM');
  });

  it('shows the PEM editor only while SSL is enabled and retains edit values', () => {
    const pem = 'saved-root-ca-pem';
    const enabled = renderFields(KIND.POSTGRES, true, pem);
    expect(enabled.html).toContain('Root CA PEM');
    expect(enabled.html).toContain(pem);
    expect(enabled.form.getValues('sslCaCert')).toBe(pem);

    const disabled = renderFields(KIND.POSTGRES, false, pem);
    expect(disabled.html).not.toContain('Root CA PEM');
    expect(disabled.form.getValues('sslCaCert')).toBe(pem);
  });

  it('keeps the PEM in form state when SSL is unchecked', () => {
    const pem = 'saved-root-ca-pem';
    const { form } = renderFields(KIND.POSTGRES, true, pem);
    form.setValue('ssl', false);
    expect(form.getValues('sslCaCert')).toBe(pem);
  });

  it('loads certificate file contents into the same form field', async () => {
    const pem = '-----BEGIN CERTIFICATE-----\nlocal-ca\n-----END CERTIFICATE-----';
    const setValue = vi.fn();
    const form = { setValue, clearErrors: vi.fn() } as unknown as UseFormReturn<CreateConnectionProfileInput>;
    await loadRootCACertificateFile({ text: async () => pem }, form);
    expect(setValue).toHaveBeenCalledWith('sslCaCert', pem, { shouldDirty: true });
  });
});
