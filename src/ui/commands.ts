import type { IconType } from 'react-icons';
import { kindOf } from '../model/ids';
import { LocalFs } from '../fs/local';
import { store, type Theme } from '../store/store';
import { confirmDelete } from './Binder';
import {
  IconIdea,
  IconClose,
  IconExport,
  IconSubmissions,
  IconMarket,
  IconFocus,
  IconInspector,
  IconMoon,
  IconNewChapter,
  IconNewScene,
  IconPaper,
  IconPart,
  IconRename,
  IconSave,
  IconSettings,
  IconSidebar,
  IconSparkle,
  IconSplit,
  IconStory,
  IconSun,
  IconSystem,
  IconTrash,
  IconType,
  IconBook,
  IconAddCharacter,
  IconCharacters,
  IconWorld,
  IconPlace,
  IconSearch,
  IconBack,
  IconArrow,
  IconWrite,
  IconPlan,
  IconCorkboard,
  IconOutline,
  IconGrid,
  IconManuscript,
  IconSubplot,
  IconMap,
  IconSnapshots,
  IconTimeline,
  IconProgress,
} from './icons';
import { openTrash } from './Trash';
import { createMapFromFile } from './maps/MapPage';
import { activeEditor } from './ProseEditor';
import { saveToFolder } from './projects';

export interface Command {
  id: string;
  title: string;
  icon: IconType;
  keys?: string;
  when?: () => boolean;
  run: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

const hasProject = () => !!store.get().project;
const selectedScene = () => {
  const id = store.get().selectedId;
  return id && kindOf(id) === 'scene' ? id : null;
};
const setTheme = (theme: Theme) => () => store.setUi({ theme });

export function commands(): Command[] {
  const s = store.get();
  const ui = s.ui;
  const mode = s.project?.meta.mode;
  return [
    { id: 'new-scene', title: 'New scene', icon: IconNewScene, keys: `${MOD} N`, when: hasProject, run: () => store.addNode('scene') },
    { id: 'new-chapter', title: 'New chapter', icon: IconNewChapter, keys: `${MOD} Shift N`, when: () => hasProject() && mode === 'novel', run: () => store.addNode('chapter') },
    { id: 'new-character', title: 'New character', icon: IconAddCharacter, when: hasProject, run: () => store.addCharacter() },
    { id: 'new-place', title: 'New place', icon: IconPlace, when: hasProject, run: () => store.addWorld('place') },
    { id: 'go-write', title: mode === 'short' ? 'Go to story' : 'Go to manuscript', icon: IconWrite, keys: `${MOD} 1`, when: hasProject, run: () => store.setSection('write') },
    { id: 'go-plan', title: 'Go to plan', icon: IconPlan, keys: `${MOD} 2`, when: hasProject, run: () => store.setSection('plan') },
    { id: 'view-corkboard', title: 'Plan: Corkboard', icon: IconCorkboard, when: hasProject, run: () => (store.setUi({ planView: 'corkboard' }), store.showOverview('plan')) },
    { id: 'view-outline', title: 'Plan: Outline', icon: IconOutline, when: hasProject, run: () => (store.setUi({ planView: 'outline' }), store.showOverview('plan')) },
    { id: 'view-grid', title: 'Plan: Plot grid', icon: IconGrid, when: hasProject, run: () => (store.setUi({ planView: 'grid' }), store.showOverview('plan')) },
    { id: 'view-manuscript', title: 'Plan: Read the whole manuscript', icon: IconManuscript, when: hasProject, run: () => (store.setUi({ planView: 'manuscript' }), store.showOverview('plan')) },
    { id: 'new-subplot', title: 'New subplot', icon: IconSubplot, when: hasProject, run: () => store.addSubplot() },
    { id: 'go-characters', title: 'Go to characters', icon: IconCharacters, keys: `${MOD} 3`, when: hasProject, run: () => store.setSection('characters') },
    { id: 'export', title: 'Export…', icon: IconExport, keys: `${MOD} Shift E`, when: hasProject, run: () => store.setExport(true) },
    { id: 'export-manuscript', title: 'Export: Standard manuscript (.docx)', icon: IconExport, when: hasProject, run: () => (store.updateMeta({ export: { ...(s.project?.meta.export as object), preset: 'manuscript' } }), store.setExport(true)) },
    { id: 'export-epub', title: 'Export: E-book (.epub)', icon: IconExport, when: hasProject, run: () => (store.updateMeta({ export: { ...(s.project?.meta.export as object), preset: 'epub' } }), store.setExport(true)) },
    { id: 'export-bible', title: 'Export: Story bible', icon: IconExport, when: hasProject, run: () => (store.updateMeta({ export: { ...(s.project?.meta.export as object), preset: 'bible' } }), store.setExport(true)) },
    { id: 'capture', title: 'Jot down an idea', icon: IconIdea, keys: `${MOD} J`, when: hasProject, run: () => store.setCapture(true, s.selectedId && ['character', 'world', 'subplot', 'scene'].includes(kindOf(s.selectedId) ?? '') ? s.selectedId : null) },
    { id: 'go-ideas', title: 'Go to ideas', icon: IconIdea, keys: `${MOD} 8`, when: hasProject, run: () => store.setSection('ideas') },
    { id: 'go-submissions', title: 'Go to submissions', icon: IconSubmissions, keys: `${MOD} 7`, when: () => hasProject() && mode === 'short', run: () => store.setSection('submissions') },
    { id: 'new-submission', title: 'New submission', icon: IconSubmissions, when: () => hasProject() && mode === 'short', run: () => (store.setSection('submissions'), store.addSubmission()) },
    { id: 'new-market', title: 'New market', icon: IconMarket, when: () => hasProject() && mode === 'short', run: () => (store.setSection('submissions'), store.addMarket()) },
    { id: 'go-timeline', title: 'Go to timeline', icon: IconTimeline, keys: `${MOD} 6`, when: hasProject, run: () => store.setSection('timeline') },
    { id: 'new-event', title: 'New timeline event', icon: IconTimeline, when: hasProject, run: () => store.addEvent('world') },
    { id: 'view-progress', title: 'Plan: Progress and goals', icon: IconProgress, when: hasProject, run: () => (store.setUi({ planView: 'progress' }), store.showOverview('plan')) },
    { id: 'go-maps', title: 'Go to maps', icon: IconMap, keys: `${MOD} 5`, when: hasProject, run: () => store.setSection('maps') },
    { id: 'new-map', title: 'New map from an image…', icon: IconMap, when: hasProject, run: () => void createMapFromFile() },
    { id: 'go-world', title: 'Go to world', icon: IconWorld, keys: `${MOD} 4`, when: hasProject, run: () => store.setSection('world') },
    { id: 'search', title: 'Search the whole project', icon: IconSearch, keys: `${MOD} Shift S`, when: hasProject, run: () => store.setSection('search') },
    { id: 'back', title: 'Go back', icon: IconBack, keys: 'Alt ←', when: () => s.history.back.length > 0, run: () => store.back() },
    { id: 'forward', title: 'Go forward', icon: IconArrow, keys: 'Alt →', when: () => s.history.forward.length > 0, run: () => store.forward() },
    { id: 'new-part', title: 'New part', icon: IconPart, when: () => hasProject() && mode === 'novel', run: () => store.addNode('part') },
    {
      id: 'scene-break',
      title: 'Insert scene break',
      icon: IconSparkle,
      keys: `${MOD} Enter`,
      when: () => !!selectedScene(),
      run: () => activeEditor.current?.insertBreak(),
    },
    {
      id: 'split',
      title: 'Split scene at cursor',
      icon: IconSplit,
      when: () => !!selectedScene() && !!activeEditor.current,
      run: () => {
        const id = selectedScene();
        const parts = activeEditor.current?.splitAtCursor();
        if (!id || !parts) return store.toast('Place the cursor in the scene where it should split.');
        store.splitScene(id, parts.before, parts.after);
        store.toast('Scene split in two');
      },
    },
    {
      id: 'snapshot',
      title: 'Take a snapshot of this scene',
      icon: IconSnapshots,
      keys: `${MOD} Alt S`,
      when: () => !!selectedScene(),
      run: () => {
        const id = selectedScene();
        if (id) void store.takeSnapshot(id);
      },
    },
    { id: 'trash', title: 'Open the trash', icon: IconTrash, when: hasProject, run: () => openTrash() },
    { id: 'rename', title: 'Rename', icon: IconRename, keys: 'F2', when: () => !!s.selectedId, run: () => s.selectedId && store.setRenaming(s.selectedId) },
    { id: 'delete', title: 'Move to trash', icon: IconTrash, when: () => !!s.selectedId, run: () => s.selectedId && confirmDelete(s.selectedId) },
    { id: 'toggle-sidebar', title: ui.sidebar ? 'Hide binder' : 'Show binder', icon: IconSidebar, keys: `${MOD} \\`, when: hasProject, run: () => store.setUi({ sidebar: !ui.sidebar }) },
    { id: 'toggle-inspector', title: ui.inspector ? 'Hide inspector' : 'Show inspector', icon: IconInspector, keys: `${MOD} .`, when: hasProject, run: () => store.setUi({ inspector: !ui.inspector }) },
    { id: 'focus', title: ui.focus ? 'Leave focus mode' : 'Focus mode', icon: IconFocus, keys: `${MOD} Shift F`, when: hasProject, run: () => store.setUi({ focus: !ui.focus }) },
    { id: 'typewriter', title: ui.typewriter ? 'Turn off typewriter scrolling' : 'Typewriter scrolling', icon: IconType, when: hasProject, run: () => store.setUi({ typewriter: !ui.typewriter }) },
    { id: 'theme-light', title: 'Theme: Daylight (lightest)', icon: IconSun, run: setTheme('light') },
    { id: 'theme-dusk', title: 'Theme: Dusk', icon: IconMoon, run: setTheme('dusk') },
    { id: 'theme-night', title: 'Theme: Night', icon: IconMoon, run: setTheme('night') },
    { id: 'theme-paper', title: 'Theme: Study (warm paper)', icon: IconPaper, run: setTheme('paper') },
    { id: 'theme-system', title: 'Theme: Auto (Study by day, Dusk by night)', icon: IconSystem, run: setTheme('system') },
    {
      id: 'mode',
      title: mode === 'short' ? 'Switch to novel mode' : 'Switch to short story mode',
      icon: mode === 'short' ? IconBook : IconStory,
      when: hasProject,
      run: () => store.setMode(mode === 'short' ? 'novel' : 'short'),
    },
    {
      id: 'save-folder',
      title: 'Save project to a folder…',
      icon: IconSave,
      when: () => s.project?.fs instanceof LocalFs,
      run: () => void saveToFolder().catch((e) => store.toast((e as Error).message)),
    },
    { id: 'settings', title: 'Settings', icon: IconSettings, keys: `${MOD} ,`, run: () => store.setSettings(true) },
    { id: 'close', title: 'Close project', icon: IconClose, when: hasProject, run: () => void store.close() },
  ].filter((c) => !c.when || c.when());
}

export function runCommand(id: string) {
  commands().find((c) => c.id === id)?.run();
}
