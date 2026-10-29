import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface Parsed {
  data: Record<string, unknown>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Split a Markdown file into YAML frontmatter and body. Files without frontmatter get empty data. */
export function parseFrontmatter(text: string): Parsed {
  const src = text.replace(/^﻿/, '');
  const m = FENCE.exec(src);
  if (!m) return { data: {}, body: src };
  let data: unknown;
  try {
    data = parseYaml(m[1]) ?? {};
  } catch (e) {
    throw new Error(`Invalid frontmatter: ${(e as Error).message}`);
  }
  if (typeof data !== 'object' || Array.isArray(data)) data = {};
  const body = src.slice(m[0].length).replace(/^\r?\n/, '');
  return { data: data as Record<string, unknown>, body };
}

const yamlOpts = { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' } as const;

export function toYaml(data: unknown): string {
  return stringifyYaml(data, yamlOpts);
}

export function fromYaml<T = unknown>(text: string): T {
  return parseYaml(text) as T;
}

/** Join frontmatter and body. Undefined and empty values are dropped to keep files tidy. */
export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    clean[k] = v;
  }
  const yaml = toYaml(clean).trimEnd();
  const text = body.replace(/\s+$/, '');
  return `---\n${yaml}\n---\n${text ? `\n${text}\n` : ''}`;
}
