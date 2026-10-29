import { useEffect, useMemo, useRef, useState } from 'react';
import { parentOfEntity, roleOf, ROLE_LABEL, worldKindOf, WORLD_TEMPLATES } from '../model/entities';
import { ROLES, WORLD_KINDS, type Doc, type WorldKind } from '../model/types';
import { store, useStore } from '../store/store';
import { confirmDelete } from './Binder';
import { IconAddCharacter, IconChevron, IconPlus, IconTrash, WORLD_ICON } from './icons';
import { fuzzy } from './Palette';
import { Avatar } from './pickers';

function useSceneCounts() {
  const docs = useStore((s) => s.project?.docs);
  const binder = useStore((s) => s.project?.meta.binder);
  return useMemo(() => {
    const idx = store.mentionIndex();
    const out: Record<string, number> = {};
    for (const [id, list] of idx.byEntity) out[id] = list.length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, binder]);
}

function Filter({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  return (
    <div className="side-filter">
      <input className="input" value={value} placeholder={`Filter ${label}`} aria-label={`Filter ${label}`} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RowMenu({ id, x, y, onClose, extra }: { id: string; x: number; y: number; onClose(): void; extra?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div className="menu" ref={ref} style={{ left: x, top: Math.min(y, window.innerHeight - 160) }} role="menu" onClick={onClose}>
      {extra}
      <button role="menuitem" className="danger" onClick={() => confirmDelete(id)}>
        <IconTrash /> Move to trash
      </button>
    </div>
  );
}

export function CharacterList() {
  const docs = useStore((s) => s.project!.docs);
  const selected = useStore((s) => s.selectedId);
  const counts = useSceneCounts();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const chars = Object.values(docs)
    .filter((d) => d.kind === 'character' && (!q || fuzzy(q, d.title)))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <div className="sidebar-tools">
        <button className={`side-link ${selected === null ? 'on' : ''}`} onClick={() => store.showOverview('characters')}>
          Characters
        </button>
        <button className="icon-btn" title="New character" aria-label="New character" onClick={() => store.addCharacter()}>
          <IconAddCharacter />
        </button>
      </div>
      <Filter value={q} onChange={setQ} label="characters" />
      <div className="binder">
        {chars.length === 0 && <div className="binder-empty">{q ? 'No matches.' : 'No characters yet. Add your first with the button above.'}</div>}
        {ROLES.map((role) => {
          const group = chars.filter((c) => roleOf(c) === role);
          if (!group.length) return null;
          return (
            <section key={role} className="side-group">
              <h3 className="side-group-title">{ROLE_LABEL[role]}</h3>
              {group.map((c) => (
                <div
                  key={c.id}
                  className={`brow entity ${selected === c.id ? 'selected' : ''}`}
                  style={{ paddingLeft: 8 }}
                  onClick={() => store.select(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ id: c.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <Avatar id={c.id} name={c.title} size={22} />
                  <span className={`btitle ${c.title ? '' : 'placeholder'}`}>{c.title || 'Unnamed'}</span>
                  {counts[c.id] ? (
                    <span className="bcount" title={`Appears in ${counts[c.id]} scenes`}>
                      {counts[c.id]}
                    </span>
                  ) : null}
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {menu && <RowMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

export function NewWorldMenu({ onClose, parent, anchor }: { onClose(): void; parent?: string | null; anchor: { x: number; y: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div className="menu" ref={ref} style={{ left: anchor.x, top: Math.min(anchor.y, window.innerHeight - 380) }} role="menu">
      {WORLD_KINDS.map((k) => {
        const Icon = WORLD_ICON[k];
        return (
          <button
            key={k}
            role="menuitem"
            onClick={() => {
              onClose();
              store.addWorld(k, undefined, parent);
            }}
          >
            <Icon /> {WORLD_TEMPLATES[k].label}
          </button>
        );
      })}
    </div>
  );
}

export function WorldTree() {
  const docs = useStore((s) => s.project!.docs);
  const selected = useStore((s) => s.selectedId);
  const expanded = useStore((s) => s.expanded);
  const counts = useSceneCounts();
  const [q, setQ] = useState('');
  const [newMenu, setNewMenu] = useState<{ x: number; y: number; parent?: string | null } | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const entries = Object.values(docs).filter((d) => d.kind === 'world');
  const byParent = new Map<string | null, Doc[]>();
  for (const e of entries) {
    const p = parentOfEntity(e);
    const key = p && docs[p] ? p : null;
    byParent.set(key, [...(byParent.get(key) ?? []), e]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.title.localeCompare(b.title));

  const renderRow = (d: Doc, depth: number): React.ReactNode => {
    const kids = byParent.get(d.id) ?? [];
    const open = expanded[d.id] ?? true;
    const Icon = WORLD_ICON[worldKindOf(d)];
    return (
      <div key={d.id}>
        <div
          className={`brow entity ${selected === d.id ? 'selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => store.select(d.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ id: d.id, x: e.clientX, y: e.clientY });
          }}
        >
          <button
            className={`twisty ${open ? 'open' : ''} ${kids.length ? '' : 'empty'}`}
            tabIndex={-1}
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              store.toggleExpanded(d.id);
            }}
          >
            <IconChevron />
          </button>
          <Icon className="kind" />
          <span className={`btitle ${d.title ? '' : 'placeholder'}`}>{d.title || 'Untitled'}</span>
          {counts[d.id] ? <span className="bcount">{counts[d.id]}</span> : null}
        </div>
        {open && kids.map((k) => renderRow(k, depth + 1))}
      </div>
    );
  };

  const roots = byParent.get(null) ?? [];
  const filtered = q ? entries.filter((e) => fuzzy(q, e.title)).sort((a, b) => a.title.localeCompare(b.title)) : null;

  return (
    <>
      <div className="sidebar-tools">
        <button className={`side-link ${selected === null ? 'on' : ''}`} onClick={() => store.showOverview('world')}>
          World
        </button>
        <button className="icon-btn" title="New world entry" aria-label="New world entry" onClick={(e) => setNewMenu({ x: e.clientX - 20, y: e.clientY + 16 })}>
          <IconPlus />
        </button>
      </div>
      <Filter value={q} onChange={setQ} label="world" />
      <div className="binder">
        {entries.length === 0 && <div className="binder-empty">Places, cultures, religions, magic and history live here. Add your first entry with the + button.</div>}
        {filtered
          ? filtered.map((d) => renderRow(d, 0))
          : WORLD_KINDS.map((k: WorldKind) => {
              const group = roots.filter((r) => worldKindOf(r) === k);
              if (!group.length) return null;
              return (
                <section key={k} className="side-group">
                  <h3 className="side-group-title">{WORLD_TEMPLATES[k].plural}</h3>
                  {group.map((d) => renderRow(d, 0))}
                </section>
              );
            })}
      </div>
      {newMenu && <NewWorldMenu anchor={newMenu} parent={newMenu.parent} onClose={() => setNewMenu(null)} />}
      {menu && (
        <RowMenu
          {...menu}
          onClose={() => setMenu(null)}
          extra={
            <button role="menuitem" onClick={(e) => setNewMenu({ x: e.clientX, y: e.clientY, parent: menu.id })}>
              <IconPlus /> New entry inside
            </button>
          }
        />
      )}
    </>
  );
}
