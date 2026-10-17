import { useCallback, useMemo, useState } from 'react';

type FieldVisibilityState = {
  scope: string;
  hiddenFields: string[];
};

type FieldVisibilityResult = {
  visibleFields: string[];
  toggleFieldVisibility: (field: string, nextVisible: boolean) => void;
};

export function collectRecordFields(records?: Record<string, unknown>[] | null): string[] {
  const fields = new Set<string>();
  if (!records || !Array.isArray(records)) return [];
  records.forEach((record) => {
    if (record && typeof record === 'object') {
      Object.keys(record).forEach((field) => fields.add(field));
    }
  });
  return Array.from(fields);
}

export function resolveVisibleFields(fields: string[], hiddenFields: string[]): string[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter((field) => !hiddenFields.includes(field));
}

// Keep at least one column visible while recording only explicit exclusions,
// which makes fields discovered by a later response visible automatically.
export function toggleHiddenField(
  fields: string[],
  hiddenFields: string[],
  field: string,
  nextVisible: boolean,
): string[] {
  if (nextVisible) return hiddenFields.filter((hiddenField) => hiddenField !== field);
  if (resolveVisibleFields(fields, hiddenFields).length <= 1 || hiddenFields.includes(field)) return hiddenFields;
  return [...hiddenFields, field];
}

export function useFieldVisibility(fields: string[] = [], scope: string): FieldVisibilityResult {
  // Store only explicit user exclusions so newly discovered columns remain
  // visible by default, while a scope change starts with every field shown.
  const safeFields = Array.isArray(fields) ? fields : [];
  const [state, setState] = useState<FieldVisibilityState>({ scope, hiddenFields: [] });
  const hiddenFields = state.scope === scope ? state.hiddenFields : [];
  const visibleFields = useMemo(() => resolveVisibleFields(safeFields, hiddenFields), [safeFields, hiddenFields]);

  const toggleFieldVisibility = useCallback(
    (field: string, nextVisible: boolean) => {
      setState((previous) => {
        const currentHiddenFields = previous.scope === scope ? previous.hiddenFields : [];
        return {
          scope,
          hiddenFields: toggleHiddenField(safeFields, currentHiddenFields, field, nextVisible),
        };
      });
    },
    [safeFields, scope],
  );

  return { visibleFields, toggleFieldVisibility };
}
