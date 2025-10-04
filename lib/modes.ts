import fs from 'node:fs';
import path from 'node:path';

export type ModeKey =
  | 'admin'
  | 'chat'
  | 'personality'
  | 'no_personality'
  | 'super_snail'
  | 'rating_unrated'
  | 'rating_pg13';
export type TargetType = 'category' | 'channel' | 'thread';
export type ModeOperation = 'merge' | 'replace' | 'remove' | 'clear';
export type ScopeFilter = 'guild' | 'category' | 'channel';
export type PresenceFilter = 'has' | 'missing';

export const MODE_KEYS: ModeKey[] = [
  'admin',
  'chat',
  'personality',
  'no_personality',
  'super_snail',
  'rating_unrated',
  'rating_pg13',
];
export const PRIMARY_MODES: ModeKey[] = ['admin', 'chat', 'super_snail'];
export const OPTIONAL_MODES: ModeKey[] = ['personality', 'no_personality'];
export const RATING_MODES: ModeKey[] = ['rating_unrated', 'rating_pg13'];

const STORE_PATH = path.join(process.cwd(), 'data_store.json');
const TARGET_TYPE_SET = new Set<TargetType>(['category', 'channel', 'thread']);

type ModeState = Record<ModeKey, boolean>;

interface ChannelModeRecord {
  guildId: string;
  targetId: string;
  targetType: TargetType;
  modes: ModeState;
  updatedAt: number;
}

interface ModeStore {
  prefs?: unknown[];
  memos?: unknown[];
  channelModes: ChannelModeRecord[];
}

interface BaseOptions {
  guildId: string;
}

export interface SetModeOptions extends BaseOptions {
  targetId: string;
  targetType: TargetType;
  modes: ModeKey[];
  operation: ModeOperation;
  actorHasManageGuild: boolean;
}

export interface ParentRef {
  targetId: string;
  targetType: TargetType;
}

export interface ViewModeOptions extends BaseOptions {
  targetId: string;
  targetType: TargetType;
  parents?: ParentRef[];
}

export interface ListModeOptions extends BaseOptions {
  scope?: ScopeFilter;
  presenceFilter?: PresenceFilter;
  presenceMode?: ModeKey;
}

export interface ModeSummary {
  label: string;
  modes: ModeState;
  updatedAt: number;
}

export interface ViewModeResult {
  direct: ModeSummary;
  inherited: ModeSummary[];
  effective: ModeSummary;
}

export interface SetModeResult {
  modes: ModeSummary;
  operation: ModeOperation;
}

function loadStore(): ModeStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ModeStore;
    parsed.channelModes ||= [];
    return parsed;
  } catch {
    return { channelModes: [] };
  }
}

function saveStore(store: ModeStore): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function emptyState(): ModeState {
  const state = {} as ModeState;
  for (const key of MODE_KEYS) state[key] = false;
  return state;
}

function normalize(record: ChannelModeRecord | null | undefined): ChannelModeRecord | null {
  if (!record) return null;
  return {
    guildId: record.guildId,
    targetId: record.targetId,
    targetType: record.targetType,
    modes: { ...emptyState(), ...record.modes },
    updatedAt: record.updatedAt ?? Date.now(),
  };
}

function ensureAdmin(hasManageGuild: boolean): void {
  if (!hasManageGuild) {
    throw new Error('Manage Guild permission required.');
  }
}

function uniqueModes(input: ModeKey[]): ModeKey[] {
  const seen = new Set<ModeKey>();
  const result: ModeKey[] = [];
  for (const mode of input) {
    if (MODE_KEYS.includes(mode) && !seen.has(mode)) {
      seen.add(mode);
      result.push(mode);
    }
  }
  return result;
}

function findRecord(store: ModeStore, guildId: string, targetId: string, targetType: TargetType): { index: number; record: ChannelModeRecord | null } {
  const index = store.channelModes.findIndex(
    (entry) => entry.guildId === guildId && entry.targetId === targetId && entry.targetType === targetType,
  );
  return { index, record: index >= 0 ? store.channelModes[index] : null };
}

function applyOperation(state: ModeState, modes: ModeKey[], operation: ModeOperation): ModeState {
  const next = { ...state };
  if (operation === 'merge') {
    for (const mode of modes) next[mode] = true;
    return next;
  }
  if (operation === 'remove') {
    for (const mode of modes) next[mode] = false;
    return next;
  }
  if (operation === 'replace') {
    const cleared = emptyState();
    for (const mode of modes) cleared[mode] = true;
    return cleared;
  }
  return emptyState();
}

function isEmpty(state: ModeState): boolean {
  return MODE_KEYS.every((mode) => !state[mode]);
}

function sanitizeRatings(
  state: ModeState,
  options: { ratingSelected?: ModeKey; operation: ModeOperation },
): ModeState {
  const next = { ...state };
  const chatActive = !!next.chat;
  const personalityActive = !!next.personality;
  if (!chatActive || !personalityActive) {
    for (const mode of RATING_MODES) next[mode] = false;
    return next;
  }

  const selected = options.ratingSelected && RATING_MODES.includes(options.ratingSelected)
    ? options.ratingSelected
    : undefined;

  if (options.operation !== 'remove' && selected) {
    for (const rating of RATING_MODES) {
      next[rating] = rating === selected;
    }
  } else {
    const activeRatings = RATING_MODES.filter((rating) => next[rating]);
    if (activeRatings.length > 1) {
      const [keep] = activeRatings;
      for (const rating of RATING_MODES) next[rating] = rating === keep;
    }
  }
  return next;
}

export function setModes(options: SetModeOptions): SetModeResult {
  ensureAdmin(options.actorHasManageGuild);
  if (!TARGET_TYPE_SET.has(options.targetType)) {
    throw new Error(`Unsupported target type: ${options.targetType}`);
  }
  let modeList = uniqueModes(options.modes);
  if (!modeList.length && options.operation !== 'clear') {
    throw new Error('Select at least one mode.');
  }

  const ratingSelected = modeList.find((mode) => RATING_MODES.includes(mode));
  if (ratingSelected && options.operation !== 'remove') {
    modeList = uniqueModes([...modeList, 'chat', 'personality']);
  }

  const store = loadStore();
  const { index, record } = findRecord(store, options.guildId, options.targetId, options.targetType);
  const normalized = normalize(record) ?? {
    guildId: options.guildId,
    targetId: options.targetId,
    targetType: options.targetType,
    modes: emptyState(),
    updatedAt: Date.now(),
  };

  let updatedModes: ModeState;
  if (options.operation === 'clear') {
    updatedModes = emptyState();
  } else {
    updatedModes = applyOperation(normalized.modes, modeList, options.operation);
    updatedModes = sanitizeRatings(updatedModes, { ratingSelected, operation: options.operation });
  }

  if (isEmpty(updatedModes)) {
    if (index >= 0) store.channelModes.splice(index, 1);
  } else {
    const entry: ChannelModeRecord = {
      guildId: options.guildId,
      targetId: options.targetId,
      targetType: options.targetType,
      modes: updatedModes,
      updatedAt: Date.now(),
    };
    if (index >= 0) store.channelModes[index] = entry;
    else store.channelModes.push(entry);
  }

  saveStore(store);

  return {
    modes: {
      label: `${options.targetType}:${options.targetId}`,
      modes: updatedModes,
      updatedAt: Date.now(),
    },
    operation: options.operation,
  };
}

function resolveInherited(store: ModeStore, guildId: string, parents: ParentRef[] = []): ChannelModeRecord[] {
  const results: ChannelModeRecord[] = [];
  for (const parent of parents) {
    const { record } = findRecord(store, guildId, parent.targetId, parent.targetType);
    const normalized = normalize(record);
    if (normalized) results.push(normalized);
  }
  return results;
}

export function combineModes(...states: ModeState[]): ModeState {
  const combined = emptyState();
  for (const state of states) {
    for (const mode of MODE_KEYS) {
      if (state[mode]) combined[mode] = true;
    }
  }
  return combined;
}

export function viewModes(options: ViewModeOptions): ViewModeResult {
  const store = loadStore();
  const inheritedRecords = resolveInherited(store, options.guildId, options.parents);
  const inheritedSummaries: ModeSummary[] = inheritedRecords.map((record) => ({
    label: `${record.targetType}:${record.targetId}`,
    modes: record.modes,
    updatedAt: record.updatedAt,
  }));

  const { record } = findRecord(store, options.guildId, options.targetId, options.targetType);
  const directRecord = normalize(record);
  const directSummary: ModeSummary = {
    label: `${options.targetType}:${options.targetId}`,
    modes: directRecord?.modes ?? emptyState(),
    updatedAt: directRecord?.updatedAt ?? Date.now(),
  };

  const effectiveState = combineModes(...inheritedSummaries.map((item) => item.modes), directSummary.modes);
  const effectiveSummary: ModeSummary = {
    label: 'effective',
    modes: effectiveState,
    updatedAt: Date.now(),
  };

  return {
    direct: directSummary,
    inherited: inheritedSummaries,
    effective: effectiveSummary,
  };
}

export function listModes(options: ListModeOptions): ModeSummary[] {
  const store = loadStore();
  const scope = options.scope ?? 'guild';
  const presenceMode = options.presenceMode;
  const presenceFilter = options.presenceFilter;

  return store.channelModes
    .filter((entry) => entry.guildId === options.guildId)
    .filter((entry) => {
      if (scope === 'category') return entry.targetType === 'category';
      if (scope === 'channel') return entry.targetType !== 'category';
      return true;
    })
    .filter((entry) => {
      if (!presenceMode || !presenceFilter) return true;
      const active = !!entry.modes[presenceMode];
      return presenceFilter === 'has' ? active : !active;
    })
    .map((entry) => ({
      label: `${entry.targetType}:${entry.targetId}`,
      modes: { ...emptyState(), ...entry.modes },
      updatedAt: entry.updatedAt,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function summarizeModes(summary: ModeSummary): string {
  const status = MODE_KEYS.map((mode) => `${mode}: ${summary.modes[mode] ? '✅' : '❌'}`).join(' | ');
  return `${summary.label} → ${status}`;
}

export function summarizeList(entries: ModeSummary[]): string[] {
  if (!entries.length) return ['📭 No explicit overrides set.'];
  return entries.map((entry) => `• ${summarizeModes(entry)}`);
}

export function summarizeView(result: ViewModeResult): string {
  const inherited = result.inherited.length
    ? result.inherited.map((entry) => summarizeModes(entry)).join('\n')
    : 'None';
  return [
    `Direct: ${summarizeModes(result.direct)}`,
    `Effective: ${summarizeModes(result.effective)}`,
    `Inherited:\n${inherited}`,
  ].join('\n');
}
