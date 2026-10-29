import { useEffect, useMemo, useRef, useState } from 'react';
import { sceneOrder } from '../model/binder';
import { hueOf, initials, roleOf, ROLE_LABEL, worldKindOf, WORLD_TEMPLATES } from '../model/entities';
import type { BinderNode, Doc } from '../model/types';
import { fuzzy } from './Palette';
import { useStore } from '../store/store';
import { useAsset } from './assets';
import { IconChevronDown, IconPlus, IconScene, IconX, WORLD_ICON } from './icons';

export function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const h = hueOf(id);
  const portrait = useStore((s) => {
    const p = s.project?.docs[id]?.fields.portrait;
    return typeof p === 'string' && p ? p : null;
  });
  const url = useAsset(portrait);
  if (url) return <img className="avatar avatar-img" src={url} alt="" aria-hidden="true" style={{ width: size, height: size }} />;
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        ['--av-h' as string]: h,
      }}
    >
      {initials(name)}
    </span>
  );
}

export interface PickOption {
  id: string;
  title: string;
  sub?: string;
  icon?: React.ReactNode;
}

export function characterOptions(docs: Record<string, Doc>): PickOption[] {
  return Object.values(docs)
    .filter((d) => d.kind === 'character')
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((d) => ({ id: d.id, title: d.title || 'Unnamed', sub: ROLE_LABEL[roleOf(d)], icon: <Avatar id={d.id} name={d.title} size={20} /> }));
}

export function worldOptions(docs: Record<string, Doc>, filter?: (d: Doc) => boolean): PickOption[] {
  return Object.values(docs)
    .filter((d) => d.kind === 'world' && (!filter || filter(d)))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((d) => {
      const k = worldKindOf(d);
      const Icon = WORLD_ICON[k];
      return { id: d.id, title: d.title || 'Untitled', sub: WORLD_TEMPLATES[k].label, icon: <Icon width={15} height={15} /> };
    });
}

export function sceneOptions(docs: Record<string, Doc>, binder: BinderNode[]): PickOption[] {
  return sceneOrder(binder)
    .filter((id) => docs[id])
    .map((id, i) => ({ id, title: docs[id].title || 'Untitled scene', sub: `Scene ${i + 1}`, icon: <IconScene width={15} height={15} /> }));
}

interface PickerProps {
  value: string | null;
  options: PickOption[];
  onChange(id: string | null): void;
  placeholder: string;
  label: string;
  /** Offer "Create “query”" when nothing matches exactly. */
  onCreate?(name: string): string | null;
  createLabel?: string;
  clearable?: boolean;
  compact?: boolean;
}

export function Picker(props: PickerProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = props.options.find((o) => o.id === props.value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={`picker ${props.compact ? 'compact' : ''}`} ref={wrap}>
      <button type="button" className="picker-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={props.label} onClick={() => setOpen(!open)}>
        {current ? (
          <>
            {current.icon}
            <span className="picker-value">{current.title}</span>
          </>
        ) : (
          <span className="picker-placeholder">{props.value ? 'Missing item' : props.placeholder}</span>
        )}
        <IconChevronDown className="picker-chev" />
      </button>
      {props.clearable && props.value && (
        <button type="button" className="icon-btn picker-clear" aria-label={`Clear ${props.label}`} onClick={() => props.onChange(null)}>
          <IconX />
        </button>
      )}
      {open && (
        <PickList
          options={props.options}
          onPick={(id) => {
            setOpen(false);
            props.onChange(id);
          }}
          onCreate={props.onCreate}
          createLabel={props.createLabel}
          onClose={() => setOpen(false)}
          label={props.label}
        />
      )}
    </div>
  );
}

export function PickList(props: {
  options: PickOption[];
  onPick(id: string): void;
  onCreate?(name: string): string | null;
  createLabel?: string;
  onClose(): void;
  label: string;
  style?: React.CSSProperties;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const items = useMemo(() => {
    const m = props.options
      .map((o) => ({ o, m: fuzzy(q, o.title) }))
      .filter((x) => x.m)
      .sort((a, b) => (q ? b.m!.score - a.m!.score : 0))
      .map((x) => x.o);
    const exact = props.options.some((o) => o.title.toLowerCase() === q.trim().toLowerCase());
    const list: (PickOption & { create?: boolean })[] = m.slice(0, 50);
    if (props.onCreate && q.trim() && !exact) list.push({ id: '__create', title: `${props.createLabel ?? 'Create'} “${q.trim()}”`, create: true, icon: <IconPlus width={15} height={15} /> });
    return list;
  }, [q, props.options, props.onCreate, props.createLabel]);
  useEffect(() => setSel(0), [q]);

  const choose = (it: (typeof items)[number] | undefined) => {
    if (!it) return;
    if (it.create) {
      const id = props.onCreate?.(q.trim());
      if (id) props.onPick(id);
    } else props.onPick(it.id);
  };

  return (
    <div className="picklist" role="dialog" aria-label={props.label} style={props.style}>
      <input
        ref={input}
        className="picklist-input"
        value={q}
        placeholder="Search"
        aria-label={`Search ${props.label}`}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((x) => Math.min(items.length - 1, x + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((x) => Math.max(0, x - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(items[sel]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            props.onClose();
          }
        }}
      />
      <ul role="listbox">
        {items.length === 0 && <li className="picklist-empty">Nothing yet</li>}
        {items.map((it, i) => (
          <li key={it.id} role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(it)}>
            {it.icon}
            <span className="pl-title">{it.title}</span>
            {it.sub && <span className="pl-hint">{it.sub}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
