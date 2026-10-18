import { useCallback, useState } from 'react';
import { safeErrorMessage } from '@kamehadb/shared';
import { api } from '@/lib/api';
import { appendFrontendLog } from '@/lib/app-logs';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Parse a string edit value into a typed value for MongoDB.
 * - `'null'` → `null`
 * - Valid JSON → parsed value
 * - Invalid JSON → raw string (for plain text fields)
 */
export function parseEditValue(editValue: string): unknown {
  if (editValue === 'null') return null;
  try {
    return JSON.parse(editValue);
  } catch {
    return editValue;
  }
}

/**
 * Shared hook for MongoDB document field editing.
 *
 * Manages the edit value string, saving state, and the save/cancel/keyboard
 * logic that is identical between the card and table views. Each component
 * keeps its own edit-target state (which key / which cell is being edited)
 * and delegates the value management + API save flow to this hook.
 */
export function useMongoFieldEdit({
  connectionId,
  collection,
  database,
  onUpdate,
  logScope,
}: {
  connectionId: string;
  collection: string;
  database: string;
  onUpdate: () => void;
  logScope: string;
}) {
  const [editValue, setEditValue] = useState('');
  const [initialValue, setInitialValue] = useState('');
  const [saving, setSaving] = useState(false);

  /** Initialize the edit value from a typed field value. */
  const startEditValue = useCallback((value: unknown) => {
    let strVal = '';
    if (value === null) {
      strVal = 'null';
    } else {
      try {
        strVal = JSON.stringify(value);
      } catch {
        // JSON.stringify throws on BigInt, circular references, etc.
        strVal = String(value);
      }
    }
    setEditValue(strVal);
    setInitialValue(strVal);
  }, []);

  /** Reset the edit value to its default empty state. */
  const clearEditValue = useCallback(() => {
    setEditValue('');
    setInitialValue('');
  }, []);

  /**
   * Save a field update to the MongoDB document.
   * If value is unchanged from initialValue, cleanly exits without unnecessary network calls. (How / Why / What)
   * Returns `true` on success or no-op (caller should clear its edit-target state),
   * `false` on failure or when the docId is missing.
   */
  const saveFieldEdit = useCallback(
    async (docId: unknown, fieldKey: string, overrideValue?: string): Promise<boolean> => {
      if (docId === null || docId === undefined) return false;
      const valToSave = overrideValue !== undefined ? overrideValue : editValue;

      // If value hasn't changed from the initial value, this is a no-op!
      // Silently finish without sending an unnecessary API update or erroring on blur. (How / Why / What)
      if (valToSave === initialValue) {
        return true;
      }

      setSaving(true);
      try {
        const parsedValue = parseEditValue(valToSave);
        const result = await api.updateMongoDocument(connectionId, {
          collection,
          database,
          filter: { _id: docId },
          update: { [fieldKey]: parsedValue },
        });
        if (result.matchedCount === 0) {
          toastError('Update failed: no document matched the filter');
          void appendFrontendLog({
            level: 'warn',
            scope: logScope,
            message: `MongoDB update matched 0 documents for _id: ${JSON.stringify(docId)}`,
          });
          return false;
        }
        toastSuccess('Field updated');
        onUpdate();
        return true;
      } catch (err) {
        const message = safeErrorMessage(err, String(err));
        toastError(`Update failed: ${message}`);
        void appendFrontendLog({
          level: 'error',
          scope: logScope,
          message: `MongoDB document update failed: ${message}`,
          stack: err instanceof Error ? err.stack : undefined,
          details: err instanceof Error ? undefined : String(err),
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [editValue, initialValue, connectionId, collection, database, onUpdate, logScope],
  );

  /** Keyboard handler for edit inputs: Enter saves, Escape cancels. */
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent, onSave: () => void, onCancel: () => void) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }, []);

  return { editValue, setEditValue, saving, startEditValue, clearEditValue, saveFieldEdit, handleEditKeyDown };
}
