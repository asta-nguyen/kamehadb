import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { appendFrontendLog } from '@/lib/app-logs';

/**
 * Parse a string edit value into a typed value for MongoDB.
 * - `'null'` → `null`
 * - Valid JSON → parsed value
 * - Invalid JSON → raw string (for plain text fields)
 */
function parseEditValue(editValue: string): unknown {
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
  const [saving, setSaving] = useState(false);

  /** Initialize the edit value from a typed field value. */
  const startEditValue = useCallback((value: unknown) => {
    if (value === null) {
      setEditValue('null');
      return;
    }
    try {
      setEditValue(JSON.stringify(value));
    } catch {
      // JSON.stringify throws on BigInt, circular references, etc.
      setEditValue(String(value));
    }
  }, []);

  /** Reset the edit value to its default empty state. */
  const clearEditValue = useCallback(() => {
    setEditValue('');
  }, []);

  /**
   * Save a field update to the MongoDB document.
   * Returns `true` on success (caller should clear its edit-target state),
   * `false` on failure or when the docId is missing.
   */
  const saveFieldEdit = useCallback(
    async (docId: unknown, fieldKey: string): Promise<boolean> => {
      if (!docId) return false;
      setSaving(true);
      try {
        const parsedValue = parseEditValue(editValue);
        await api.updateMongoDocument(connectionId, {
          collection,
          database,
          filter: { _id: docId },
          update: { [fieldKey]: parsedValue },
        });
        onUpdate();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        alert(`Update failed: ${message}`);
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
    [editValue, connectionId, collection, database, onUpdate, logScope],
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
