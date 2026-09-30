// Keyboard shortcuts shared by every entry page (GST bill, delivery challan,
// buyer's PO, estimate, purchase, credit / debit note, receipt, payment):
//
//   F2      new entry   (asks first when `isDirty`)
//   Ctrl+S  save        (Cmd+S on a Mac) — instead of the browser's "Save page"
//   Ctrl+P  print       — only on pages that pass onPrint; otherwise the browser's own print
//   F8      open the last saved entry
//
// Each page passes its own actions; they are read through a ref so the single
// document listener always calls the latest ones.
import React, { useEffect, useRef } from 'react';
import { fetchJson } from '../../api';
import './entryShortcuts.css';

export const useEntryShortcuts = (actions) => {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const onKeyDown = (e) => {
      const a = ref.current || {};
      // Chrome fires keydown with no `key` when a datalist suggestion or autofill is picked.
      if (typeof e.key !== 'string') return;
      const key = e.key.toLowerCase();
      const ctrl = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
      if (e.key === 'F2' && a.onNew) {
        e.preventDefault();
        if (a.isDirty && !window.confirm(a.confirmNew || 'Discard this unsaved entry and start a new one?')) return;
        a.onNew();
      } else if (ctrl && key === 's' && a.onSave) {
        e.preventDefault();
        a.onSave();
      } else if (ctrl && key === 'p' && a.onPrint) {
        e.preventDefault();
        a.onPrint();
      } else if (e.key === 'F8' && a.onOpenLast) {
        e.preventDefault();
        a.onOpenLast();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
};

// The newest document from a paginated list API (e.g. /api/delivery-challans).
export const fetchLatest = async (url, noneMessage = 'Nothing saved yet.') => {
  const result = await fetchJson(`${url}?page=1&limit=1`);
  const doc = (Array.isArray(result) ? result : result?.data || [])[0];
  if (!doc) throw new Error(noneMessage);
  return doc;
};

// "F2 New · Ctrl+S Save · Ctrl+P Print · F8 Last …" hint shown under a page's buttons.
export const ShortcutHint = ({ entry = 'bill', print = true, last = true }) => (
  <p className="entry-shortcuts">
    <kbd>F2</kbd> New {entry} · <kbd>Ctrl</kbd>+<kbd>S</kbd> Save
    {print ? <> · <kbd>Ctrl</kbd>+<kbd>P</kbd> Print</> : null}
    {last ? <> · <kbd>F8</kbd> Last {entry}</> : null}
  </p>
);
