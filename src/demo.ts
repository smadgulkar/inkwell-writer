import { serializeDoc, serializeMeta, docPath } from './model/project';
import type { Doc, ProjectMeta } from './model/types';
import { DEMO_MAP_SVG_B64 } from './demoMap';
import { ideaTitle } from './model/ideas';

// A small sample novel so people can feel the app before starting their own.

const scene = (id: string, title: string, synopsis: string, status: string, body: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  kind: 'scene',
  title,
  body,
  fields: { synopsis, status, target: 1500, created: '2026-10-01T09:00:00Z', ...extra },
});

export function demoFiles(): { text: Record<string, string>; binary: Record<string, string> } {
  const docs: Doc[] = [
    { id: 'pt_saltroad', kind: 'part', title: 'Part One: The Crossing', body: '', fields: {} },
    { id: 'ch_station1', kind: 'chapter', title: 'The Station', body: 'Mara arrives. Establish the empty platform and the debt she carries.', fields: {} },
    scene(
      'sc_arrival1',
      'Arrival',
      'Mara steps off the last train into a town that was expecting someone else.',
      'revised',
      `The train left before Mara had found her ticket, which was a kind of answer in itself.

She stood on the platform with her one bag and her brother’s coat, the sleeves rolled twice, and watched the last carriage shrink into the white glare of the salt flats. Nobody had come to meet her. The letter had promised a guide, a mule, and *a fair wage for honest walking*. The platform offered a bench, a bell with no rope, and a sign so sun-bleached that only the word **SALT** survived.

“You’re late,” said a voice behind her.

She turned. A girl of perhaps twelve sat on the station roof, legs dangling, eating an apple with the slow concentration of someone who had nowhere else to be.

“The train was on time,” Mara said.

“Not the train. You.” The girl threw the core onto the tracks. “The caravan left yesterday.”

***

By nightfall the platform was empty, and Mara had learned three things. The girl’s name was [Tess](ink:cr_tess0001). The caravan would not wait. And the only person in town willing to cross the flats out of season was the man who had written the letter — and he had been dead for a week.`,
      { pov: 'cr_mara0001', location: 'wl_brine001', subplots: ['sp_debt0001', 'sp_tess0001'], beats: { sp_debt0001: 'The letter-writer is dead' } },
    ),
    scene(
      'sc_ledger01',
      'The Ledger',
      'In the dead man’s office Mara finds a ledger with her brother’s name in it.',
      'draft',
      `The office smelled of lamp oil and old paper. Tess held the light while Mara worked the drawer open with a butter knife.

Inside was a ledger bound in cracked green leather. Most of the pages listed names and sums in a cramped, careful hand. Near the end, underlined twice, was a name she knew better than her own.

*Oren Venn. Paid in full. Do not send him back.*`,
      { pov: 'cr_mara0001', location: 'wl_brine001', subplots: ['sp_debt0001'], beats: { sp_debt0001: 'Oren’s name in the ledger' } },
    ),
    { id: 'ch_flats001', kind: 'chapter', title: 'The Flats', body: '', fields: {} },
    scene('sc_mule0001', 'A Mule Named Bishop', 'Mara buys the only animal for sale; it has opinions.', 'outline', '', { subplots: ['sp_tess0001'] }),
    scene(
      'sc_firstnite',
      'First Night on the Salt',
      'Cold, stars, and the first sign that someone is following them.',
      'idea',
      '',
      { subplots: ['sp_follow01'] },
    ),
    { id: 'ch_cross001', kind: 'chapter', title: 'The Crossing', body: '', fields: {} },
    scene('sc_reading1', 'Reading the Salt', 'Tess shows Mara how the old masters read the crust. It costs her a day of sight.', 'outline', '', {
      subplots: ['sp_tess0001'],
      beats: { sp_tess0001: 'Tess trusts Mara with her one skill' },
    }),
    scene('sc_sinkhole', 'The Sinkhole', 'Bishop goes through the crust; Mara nearly follows.', 'idea', '', { subplots: ['sp_follow01'], beats: { sp_follow01: 'Footprints that are not theirs' } }),
    scene('sc_letter01', 'Oren’s Third Letter', 'Mara rereads the last letter and finally sees what Oren was hiding.', 'outline', '', {
      subplots: ['sp_debt0001'],
      beats: { sp_debt0001: 'The letter mentions a second ledger' },
    }),
    { id: 'ch_blind001', kind: 'chapter', title: 'Salt Blind', body: '', fields: {} },
    scene('sc_stranger', 'The Stranger', 'The follower reaches their camp, and he knows Oren’s name.', 'idea', '', {
      subplots: ['sp_follow01', 'sp_debt0001'],
      beats: { sp_follow01: 'Revealed: Cole’s man' },
    }),
    scene('sc_promise1', 'A Promise Made', 'Mara promises to take Tess all the way, and means it.', 'idea', '', { subplots: ['sp_tess0001'], beats: { sp_tess0001: 'Turning point: Mara chooses her' } }),
  ];
  const entities: Doc[] = [
    {
      id: 'cr_mara0001',
      kind: 'character',
      title: 'Mara Venn',
      body: 'Grew up on the coast, three days from the nearest salt road. Raised her younger brother after their mother drowned. She has never trusted anyone who offered help for free, and the letter offered exactly that.',
      fields: {
        role: 'protagonist',
        aliases: ['the Widow'],
        profile: { Age: '34', Appearance: 'Sun-cracked hands, her brother’s coat', Occupation: 'Former net-mender', Motivation: 'Find out what happened to Oren', Fear: 'Open water', Secret: 'She sent Oren to the flats', Voice: 'Short sentences; never asks twice' },
        arc: { start: 'Trusts no one, travels alone', end: 'Leads the caravan home', beats: [{ label: 'Finds Oren’s name in the ledger', scene: 'sc_ledger01' }, { label: 'Lets Tess come with her' }] },
        relationships: [
          { to: 'cr_oren0001', kind: 'sibling', note: 'Missing younger brother' },
          { to: 'cr_tess0001', kind: 'guardian', note: 'Reluctantly' },
        ],
      },
    },
    {
      id: 'cr_tess0001',
      kind: 'character',
      title: 'Tess',
      body: 'Twelve, maybe. Knows every roof in Brine and every lie told under them.',
      fields: {
        role: 'supporting',
        profile: { Age: '12', Appearance: 'Too-big boots, apple in hand', Motivation: 'Leave Brine before winter', Fear: 'Being left behind again', Voice: 'Answers questions with better questions' },
        relationships: [{ to: 'cr_cole0001', kind: 'rival', note: 'He owes her money' }],
      },
    },
    {
      id: 'cr_oren0001',
      kind: 'character',
      title: 'Oren Venn',
      body: 'Crossed the flats eighteen months ago and stopped writing after the third letter.',
      fields: { role: 'minor', profile: { Age: '26', Occupation: 'Caravan hand', Secret: 'Paid his way out of something' } },
    },
    {
      id: 'cr_cole0001',
      kind: 'character',
      title: 'Abel Cole',
      body: 'Wrote the letter. Dead a week before Mara arrives.',
      fields: { role: 'antagonist', profile: { Occupation: 'Salt factor', Motivation: 'Keep the ledger closed' }, relationships: [{ to: 'cr_oren0001', kind: 'employer' }] },
    },
    {
      id: 'wl_flats001',
      kind: 'world',
      title: 'The Salt Flats',
      body: 'A white plain three hundred miles across. In summer the glare blinds; in winter the crust can give way over brine pools.',
      fields: { kind: 'place', pronunciation: '', profile: { Type: 'Salt desert', Climate: 'Scorching days, freezing nights', Population: 'None that stays', 'Known for': 'Mirages, sinkholes, the caravan road' } },
    },
    {
      id: 'wl_brine001',
      kind: 'world',
      title: 'Brine',
      body: 'Last town before the flats. One street, one station, one bell with no rope.',
      fields: { kind: 'place', parent: 'wl_flats001', profile: { Type: 'Railhead town', Population: 'About 300', 'Ruled by': 'The salt factors', 'Known for': 'Its station, and the people who never leave it' } },
    },
    {
      id: 'wl_guild001',
      kind: 'world',
      title: 'The Caravan Guild',
      body: 'Licenses every crossing. Keeps a ledger of who went out and who came back.',
      fields: { kind: 'culture', profile: { Values: 'Debt is sacred', Customs: 'No crossing out of season', Dress: 'Pale wraps, smoked goggles' } },
    },
    {
      id: 'wl_salt0001',
      kind: 'world',
      title: 'Salt-reading',
      body: 'Old caravan masters claim they can read a route in the crystal patterns of the crust.',
      fields: {
        kind: 'magic',
        pronunciation: 'SALT-reed-ing',
        profile: { Source: 'Patterns in the salt crust', 'Who can use it': 'Anyone who survives three crossings', 'How it is learned': 'From a master, on the flats' },
        rules: ['Works only on undisturbed crust', 'Shows the safe path, never the destination'],
        costs: ['The reader goes snow-blind for a day'],
        limits: ['Useless after rain', 'Cannot find a person'],
      },
    },
  ];

  const subplots: Doc[] = [
    {
      id: 'sp_debt0001',
      kind: 'subplot',
      title: 'Oren’s debt',
      body: 'Who paid Oren’s debt, and what did it buy? Answered when Mara finds the second ledger.',
      fields: { color: 0, status: 'rising', characters: ['cr_mara0001', 'cr_oren0001', 'cr_cole0001'] },
    },
    {
      id: 'sp_tess0001',
      kind: 'subplot',
      title: 'Mara and Tess',
      body: 'A woman who trusts no one and a girl nobody keeps. Ends when Mara chooses to be responsible for someone again.',
      fields: { color: 3, status: 'setup', characters: ['cr_mara0001', 'cr_tess0001'] },
    },
    {
      id: 'sp_follow01',
      kind: 'subplot',
      title: 'The follower',
      body: 'Someone is tracking them across the flats.',
      fields: { color: 6, status: 'setup', characters: ['cr_cole0001'] },
    },
  ];

  const STORY_DATES: Record<string, string> = {"sc_arrival1": "412-3-9", "sc_ledger01": "412-3-10", "sc_mule0001": "412-3-12", "sc_firstnite": "412-3-12", "sc_reading1": "412-3-15", "sc_sinkhole": "412-3-17", "sc_letter01": "412-3-18", "sc_stranger": "412-3-21", "sc_promise1": "412-3-22"};
  for (const d of docs) if (STORY_DATES[d.id]) d.fields.storyDate = STORY_DATES[d.id];

  const ev = (id: string, title: string, date: string, scope: 'world' | 'story', body: string, extra: Record<string, unknown> = {}): Doc => ({
    id,
    kind: 'event',
    title,
    body,
    fields: { date, scope, ...extra },
  });
  const events: Doc[] = [
    ev('ev_founding', 'The Guild charters the Salt Road', '1-1-1', 'world', 'The year count begins here: the first licensed crossing, eleven wagons, nine arrived.', { entities: ['wl_brine001'] }),
    ev('ev_drowning', 'The Drowned Season', '203-6', 'world', 'Three summers of rain turn the flats to brine. The old road is lost and redrawn.', { end: '205-9', entities: ['wl_flats001'] }),
    ev('ev_readers1', 'Salt-readers outlawed', '371', 'world', 'The Guild bans crust-reading after the Kesh caravan disaster. The masters go quiet, not extinct.'),
    ev('ev_orenleft', 'Oren leaves for the far range', '409-8-2', 'story', 'Mara’s brother signs on with an out-of-season caravan and does not say why.', { entities: ['cr_mara0001'] }),
    ev('ev_lastlett', 'Oren’s last letter is posted', '411-11-30', 'story', 'Postmarked from the range. The handwriting is steady; the paper is not his.', { scene: 'sc_letter01' }),
    ev('ev_writerdd', 'The letter-writer dies', '412-3-2', 'story', 'A week before Mara arrives. Nobody in town calls it an accident, and nobody calls it anything else.', { scene: 'sc_arrival1' }),
  ];

  const idea = (id: string, type: string, created: string, body: string, extra: Record<string, unknown> = {}): Doc => ({
    id,
    kind: 'idea',
    title: ideaTitle(body),
    body,
    fields: { ideaType: type, typeAuto: true, status: 'new', created, ...extra },
  });
  const ideas: Doc[] = [
    idea('id_stranger1', 'plot', '2026-10-21T21:14:00Z', 'What if the stranger knew Oren as a boy? He could be the one who taught Oren to read the salt, and he blames Mara for sending him out.'),
    idea('id_hum00001', 'character', '2026-10-20T08:02:00Z', 'Tess hums the tune Mara’s mother used to sing. Mara notices and says nothing, but it is the first time she lets Tess walk beside her.'),
    idea('id_sorry001', 'line', '2026-10-19T23:40:00Z', '“You don’t get to be sorry, Mara. Not out here.”'),
    idea('id_chapel01', 'place', '2026-10-18T17:25:00Z', 'A salt chapel half-sunk in the flats, where caravans leave a pinch of salt for the drowned. Somewhere to shelter in a storm.'),
    idea('id_readers1', 'event', '2026-10-17T10:11:00Z', 'Long before the story, the Caravan Guild paid salt-readers to lie about safe routes. That is the real reason reading was outlawed.'),
    idea('id_steps001', 'scene', '2026-10-16T19:55:00Z', 'Last chapter opening image: footprints in the crust that stop mid-step, as if whoever made them was lifted away.'),
    idea('id_debts001', 'theme', '2026-10-12T07:30:00Z', 'The book is really about the debts we inherit and whether paying them is love or habit.', { status: 'kept' }),
  ];

  const meta: ProjectMeta = {
    format: 1,
    title: 'The Salt Road',
    author: 'Sample project',
    mode: 'novel',
    goals: { project: 90000, daily: 1000 },
    calendar: {
      name: 'Guild Reckoning',
      era: 'AT',
      months: [
        { name: 'Thaw', days: 30 },
        { name: 'Bloom', days: 30 },
        { name: 'Salt', days: 31 },
        { name: 'Glare', days: 31 },
        { name: 'Haze', days: 30 },
        { name: 'Storm', days: 31 },
        { name: 'Harvest', days: 30 },
        { name: 'Ember', days: 31 },
        { name: 'Ash', days: 30 },
        { name: 'Frost', days: 30 },
        { name: 'Dark', days: 31 },
        { name: 'Turning', days: 30 },
      ],
    },
    binder: [
      {
        id: 'pt_saltroad',
        children: [
          { id: 'ch_station1', children: [{ id: 'sc_arrival1' }, { id: 'sc_ledger01' }] },
          { id: 'ch_flats001', children: [{ id: 'sc_mule0001' }, { id: 'sc_firstnite' }] },
          { id: 'ch_cross001', children: [{ id: 'sc_reading1' }, { id: 'sc_sinkhole' }, { id: 'sc_letter01' }] },
          { id: 'ch_blind001', children: [{ id: 'sc_stranger' }, { id: 'sc_promise1' }] },
        ],
      },
    ],
  };
  const files: Record<string, string> = { 'project.yaml': serializeMeta(meta) };
  const maps: Doc[] = [
    {
      id: 'mp_saltroad',
      kind: 'map',
      title: 'The Salt Road',
      body: 'Drawn from the Guild’s crossing charts. Distances are rough; the flats move.',
      fields: {
        image: 'assets/the-salt-road.svg',
        width: 1600,
        height: 1000,
        pins: [
          { id: 'pn_brine01', x: 0.3125, y: 0.47, entity: 'wl_brine001' },
          { id: 'pn_flats01', x: 0.47, y: 0.44, entity: 'wl_flats001' },
          { id: 'pn_sink001', x: 0.5656, y: 0.61, label: 'The sinkhole' },
          { id: 'pn_camp001', x: 0.65, y: 0.54, label: 'First camp' },
          { id: 'pn_range01', x: 0.8125, y: 0.47, label: 'Where Oren’s letters stopped' },
        ],
        journeys: [
          {
            id: 'jr_mara001',
            character: 'cr_mara0001',
            stops: [
              { pin: 'pn_brine01', scene: 'sc_arrival1' },
              { pin: 'pn_sink001', scene: 'sc_sinkhole' },
              { pin: 'pn_camp001', scene: 'sc_stranger' },
            ],
          },
        ],
      },
    },
  ];
  for (const d of [...docs, ...entities, ...subplots, ...maps, ...events, ...ideas]) files[docPath(d.id)] = serializeDoc(d);
  return { text: files, binary: { 'assets/the-salt-road.svg': DEMO_MAP_SVG_B64 } };
}
