// Optional: ask Claude to sort an idea more deeply. Used only when the writer adds their own
// Anthropic API key in Settings. The key stays on this device (never in the project folder).

import { sceneOrder, parentOf } from '../model/binder';
import { aliasesOf, worldKindOf } from '../model/entities';
import { IDEA_TYPES, type IdeaType } from '../model/ideas';
import type { BinderNode, Doc } from '../model/types';

const KEY = 'inkwell:claude-key';
const MODEL_KEY = 'inkwell:claude-model';
const AUTO_KEY = 'inkwell:claude-auto';

export const CLAUDE_MODELS = [
  ['claude-haiku-5-5', 'Haiku (fast, low cost)'],
  ['claude-sonnet-5-5', 'Sonnet (more thoughtful)'],
] as const;

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
};

export const assistant = {
  key: () => read(KEY),
  setKey: (v: string) => write(KEY, v.trim()),
  model: () => read(MODEL_KEY) || CLAUDE_MODELS[0][0],
  setModel: (v: string) => write(MODEL_KEY, v),
  auto: () => read(AUTO_KEY) === '1',
  setAuto: (on: boolean) => write(AUTO_KEY, on ? '1' : ''),
  enabled: () => !!read(KEY),
};

export interface ClaudeSort {
  type: IdeaType;
  title: string;
  links: string[];
  target: string | null;
  why: string;
  questions: string[];
}

/** A compact catalogue of the project for the model: names, kinds and scene synopses. */
export function projectContext(docs: Record<string, Doc>, binder: BinderNode[], maxScenes = 160) {
  const lines: string[] = [];
  for (const d of Object.values(docs)) {
    if (d.kind === 'character') lines.push(`${d.id} | character | ${d.title}${aliasesOf(d).length ? ` (also: ${aliasesOf(d).join(', ')})` : ''}`);
    else if (d.kind === 'world') lines.push(`${d.id} | ${worldKindOf(d)} | ${d.title}`);
    else if (d.kind === 'subplot') lines.push(`${d.id} | subplot | ${d.title}`);
  }
  const scenes = sceneOrder(binder)
    .slice(0, maxScenes)
    .map((id) => {
      const s = docs[id];
      if (!s) return '';
      const ch = parentOf(binder, id);
      const syn = typeof s.fields.synopsis === 'string' ? s.fields.synopsis.slice(0, 140) : '';
      return `${id} | scene${ch && docs[ch.id] ? ` in "${docs[ch.id].title}"` : ''} | ${s.title}${syn ? ` — ${syn}` : ''}`;
    })
    .filter(Boolean);
  return [...lines, ...scenes].join('\n');
}

const TOOL = {
  name: 'sort_idea',
  description: 'Record how this writing idea should be filed in the project.',
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...IDEA_TYPES], description: 'What kind of idea this is.' },
      title: { type: 'string', description: 'A short title for the idea, under 60 characters, in the writer’s own terms.' },
      links: { type: 'array', items: { type: 'string' }, description: 'Ids from the project list that the idea is about. Only ids that appear in the list.' },
      target: { type: ['string', 'null'], description: 'The id of the one scene this idea best belongs in or near, or null if none fits.' },
      why: { type: 'string', description: 'One plain sentence on why it belongs there (or what it is about).' },
      questions: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'Up to three short questions that would help the writer develop the idea.' },
    },
    required: ['type', 'title', 'links', 'target', 'why', 'questions'],
  },
};

export async function askClaude(text: string, docs: Record<string, Doc>, binder: BinderNode[], opts: { fetchImpl?: typeof fetch } = {}): Promise<ClaudeSort> {
  const key = assistant.key();
  if (!key) throw new Error('Add your Anthropic API key in Settings first.');
  const res = await (opts.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: assistant.model(),
      max_tokens: 800,
      system:
        'You help a novelist file loose ideas inside their writing project. Classify the idea, link it only to ids from the project list, pick at most one scene it belongs in, and ask short questions that would deepen it. Never invent ids. Keep the writer’s voice; do not rewrite the idea.',
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'sort_idea' },
      messages: [{ role: 'user', content: `Project:\n${projectContext(docs, binder)}\n\nIdea:\n${text}` }],
    }),
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'The API key was not accepted.' : res.status === 429 ? 'Claude is busy or the key is out of credit; try again shortly.' : `Claude returned an error (${res.status}).`;
    throw new Error(msg);
  }
  const data = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
  const input = data.content?.find((c) => c.type === 'tool_use')?.input;
  if (!input) throw new Error('Claude did not return a suggestion.');
  const type = IDEA_TYPES.includes(input.type as IdeaType) ? (input.type as IdeaType) : 'other';
  const links = (Array.isArray(input.links) ? input.links : []).filter((x): x is string => typeof x === 'string' && !!docs[x]);
  const target = typeof input.target === 'string' && docs[input.target]?.kind === 'scene' ? input.target : null;
  return {
    type,
    title: typeof input.title === 'string' ? input.title.slice(0, 80) : '',
    links,
    target,
    why: typeof input.why === 'string' ? input.why : '',
    questions: (Array.isArray(input.questions) ? input.questions : []).filter((q): q is string => typeof q === 'string').slice(0, 3),
  };
}
