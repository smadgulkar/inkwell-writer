import { useLayoutEffect, useRef } from 'react';
import { findNode, parentOf, scenesUnder } from '../model/binder';
import { kindOf } from '../model/ids';
import type { Doc, Status } from '../model/types';
import { formatCount } from '../model/words';
import { store, useStore } from '../store/store';
import { IconChevron, IconPlus } from './icons';
import { ProseEditor } from './ProseEditor';
import { useEntityLinking } from './linking';

export function AutoTextarea({
  ref: outer,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; ref?: React.Ref<HTMLTextAreaElement> }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (typeof outer === 'function') outer(el);
        else if (outer) (outer as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      }}
      rows={1}
      {...props}
    />
  );
}

function Crumbs({ id }: { id: string }) {
  const binder = useStore((s) => s.project!.meta.binder);
  const docs = useStore((s) => s.project!.docs);
  const chain: Doc[] = [];
  let p = parentOf(binder, id);
  while (p) {
    if (docs[p.id]) chain.unshift(docs[p.id]);
    p = parentOf(binder, p.id);
  }
  return (
    <nav className="crumbs" aria-label="Location">
      {chain.map((d, i) => (
        <span key={d.id} style={{ display: 'contents' }}>
          {i > 0 && <IconChevron />}
          <button onClick={() => store.select(d.id)}>{d.title || 'Untitled'}</button>
        </span>
      ))}
    </nav>
  );
}

export function Page() {
  const id = useStore((s) => s.selectedId);
  const doc = useStore((s) => (s.selectedId ? s.project?.docs[s.selectedId] : undefined));
  const mode = useStore((s) => s.project?.meta.mode);
  const scrollRef = useRef<HTMLDivElement>(null);

  // New selection starts at the top of the page.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [id]);

  if (!id || !doc) {
    return (
      <div className="page-scroll" ref={scrollRef}>
        <div className="page">
          <p className="synopsis-input" style={{ marginTop: 0 }}>
            Choose a scene in the binder, or add one with <kbd>Ctrl</kbd> <kbd>N</kbd>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll" ref={scrollRef}>
      <article className="page sheet">
        <header className="page-head">
          {mode === 'novel' && <Crumbs id={id} />}
          <AutoTextarea
            className={`title-input ${doc.kind !== 'scene' ? 'chapter' : ''}`}
            value={doc.title}
            placeholder={doc.kind === 'scene' ? 'Untitled scene' : `Untitled ${doc.kind}`}
            aria-label="Title"
            onChange={(e) => store.updateDoc(id, { title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.currentTarget.parentElement?.querySelector('.synopsis-input') as HTMLElement | null)?.focus();
              }
            }}
          />
          {doc.kind === 'scene' && (
            <AutoTextarea
              className="synopsis-input"
              value={String(doc.fields.synopsis ?? '')}
              placeholder="One line on what happens in this scene"
              aria-label="Synopsis"
              onChange={(e) => store.updateDoc(id, { fields: { synopsis: e.target.value.replace(/\n/g, ' ') } })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (scrollRef.current?.querySelector('.prose') as HTMLElement | null)?.focus();
                }
              }}
            />
          )}
        </header>
        <div className="page-divider" />
        {doc.kind === 'scene' ? <SceneBody doc={doc} scrollRef={scrollRef} /> : <ContainerBody doc={doc} />}
      </article>
    </div>
  );
}

function SceneBody({ doc, scrollRef }: { doc: Doc; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const rev = useStore((s) => s.externalRev);
  const ui = useStore((s) => s.ui);
  const linking = useEntityLinking();
  return (
    <ProseEditor
      docId={doc.id}
      markdown={doc.body}
      rev={rev}
      onChange={(md, docId) => store.updateDoc(docId, { body: md })}
      onSelectionWords={(n) => store.setSelectionWords(n)}
      {...linking}
      placeholder="Begin the scene…"
      typewriter={ui.typewriter}
      scrollParent={() => scrollRef.current}
    />
  );
}

function ContainerBody({ doc }: { doc: Doc }) {
  const rev = useStore((s) => s.externalRev);
  const binder = useStore((s) => s.project!.meta.binder);
  const docs = useStore((s) => s.project!.docs);
  const counts = useStore((s) => s.counts);
  const node = findNode(binder, doc.id);
  const children = node?.children ?? [];
  const childKind = doc.kind === 'part' ? 'chapter' : 'scene';
  const total = scenesUnder(binder, doc.id).reduce((a, x) => a + (counts[x] ?? 0), 0);
  const linking = useEntityLinking();

  return (
    <>
      <ProseEditor
        docId={doc.id}
        markdown={doc.body}
        rev={rev}
        onChange={(md, docId) => store.updateDoc(docId, { body: md })}
        placeholder={`Notes for this ${doc.kind}: purpose, beats, reminders…`}
        {...linking}
        className="no-indent notes"
      />
      <div className="section-label">
        <span>
          {children.length} {children.length === 1 ? 'item' : 'items'}, {formatCount(total)} words
        </span>
      </div>
      <div className="cards">
        {children.map((c) => {
          const d = docs[c.id];
          if (!d) return null;
          const k = kindOf(c.id);
          const words = k === 'scene' ? counts[c.id] ?? 0 : scenesUnder(binder, c.id).reduce((a, x) => a + (counts[x] ?? 0), 0);
          const syn = k === 'scene' ? String(d.fields.synopsis ?? '') : d.body.split('\n')[0];
          return (
            <button key={c.id} className="card" onClick={() => store.select(c.id)}>
              <span className="card-title">
                {k === 'scene' && <span className={`status-dot ${(d.fields.status as Status) ?? 'draft'}`} />}
                {d.title || 'Untitled'}
              </span>
              <span className="card-syn">{syn || <em style={{ opacity: 0.7 }}>No synopsis yet</em>}</span>
              <span className="card-meta">
                <span>{k === 'scene' ? String(d.fields.status ?? 'draft') : `${c.children?.length ?? 0} scenes`}</span>
                <span>{formatCount(words)} words</span>
              </span>
            </button>
          );
        })}
        <button className="card add" onClick={() => store.addNode(childKind, { targetId: doc.id, pos: 'inside' })}>
          <IconPlus width={16} height={16} /> Add {childKind}
        </button>
      </div>
    </>
  );
}
