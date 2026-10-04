import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { stowageApi, type Cargo, type CargoType, type PowerCircuit, type ReeferSocket } from './api';

export type StowageComment = {
  id: string;
  cargoId: string;
  author: string;
  role: '船长' | '码头' | '货主';
  content: string;
  status: '待确认' | '已接受' | '已退回';
};

export type ReviewInfo = {
  /** 复核所基于的方案版本；与 planRevision 不一致即表示结论已失效 */
  revision: number;
  passed: boolean;
  checkedAt: string;
  note: string;
};

export type OfflineRecord = {
  /** 客户端记录唯一号，用于回连去重，重复上传不重复扣减 */
  clientId: string;
  cargoId: string;
  socketId: string;
  officer: string;
  recordedAt: string;
};

export type SocketEvent = {
  id: string;
  at: string;
  cargoId: string;
  socketId: string;
  officer: string;
  outcome: 'confirmed' | 'conflict' | 'overload' | 'duplicate';
  detail: string;
  alternatives?: string[];
};

export type LastResult = {
  cargoId: string;
  socketId: string;
  officer: string;
  outcome: SocketEvent['outcome'];
  detail: string;
  alternatives?: string[];
};

type State = {
  schemaVersion: number;
  legacyUpgraded: boolean;
  cargo: Cargo[];
  circuits: PowerCircuit[];
  sockets: ReeferSocket[];
  activeCargoId: string;
  planRevision: number;
  comments: StowageComment[];
  acceptedLimits: string[];
  locked: boolean;
  viewMode: '3d' | 'section';
  draftSavedAt: string;
  review: ReviewInfo | null;
  online: boolean;
  offlineQueue: OfflineRecord[];
  processedRecordIds: string[];
  socketLog: SocketEvent[];
  lastResult: LastResult | null;
};

const initialCargo: Cargo[] = [
  { id: 'BL-88214', bill: 'SEA-88214', type: '集装箱', bay: 12, row: 4, tier: 2, deck: '主甲板', weight: 24.6, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2b7c75', reefer: { reefer: true, kw: 6, socketId: 'SK-D12-1' } },
  { id: 'BL-88219', bill: 'SEA-88219', type: '集装箱', bay: 13, row: 4, tier: 2, deck: '主甲板', weight: 28.1, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: 'UN 1263', lashing: '需复核', color: '#c77835', reefer: { reefer: true, kw: 9, socketId: 'SK-D13-1' } },
  { id: 'BL-88231', bill: 'SEA-88231', type: '集装箱', bay: 10, row: 6, tier: 1, deck: '主甲板', weight: 18.2, dimension: '20 × 8 × 8.6 ft', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#366d94', reefer: { reefer: true, kw: 4, socketId: 'SK-H10-1' } },
  { id: 'BL-88240', bill: 'SEA-88240', type: '集装箱', bay: 8, row: 2, tier: 2, deck: '货舱', weight: 31.4, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '待绑扎', color: '#6d528d' },
  { id: 'BL-88247', bill: 'SEA-88247', type: '重大件', bay: 15, row: 0, tier: 1, deck: '主甲板', weight: 112.5, dimension: '18.4 × 4.2 × 4.8 m', port: '温哥华', hazmat: '无', lashing: '需复核', color: '#b64f49' },
  { id: 'BL-88254', bill: 'SEA-88254', type: '散货', bay: 5, row: 0, tier: 0, deck: '货舱', weight: 286.0, dimension: '散装 / 420 m³', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#9a7836' },
  { id: 'BL-88260', bill: 'SEA-88260', type: '集装箱', bay: 11, row: 2, tier: 1, deck: '主甲板', weight: 21.7, dimension: '20 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2f87a4', reefer: { reefer: true, kw: 5, socketId: null } }
];

const initialCircuits: PowerCircuit[] = [
  { id: 'C1', name: '主甲板冷藏回路 C1', capacityKw: 18, socketIds: ['SK-D10-1', 'SK-D10-2', 'SK-D12-1', 'SK-D12-2', 'SK-D13-1', 'SK-D13-2'] },
  { id: 'C2', name: '主甲板冷藏回路 C2', capacityKw: 30, socketIds: ['SK-D14-1', 'SK-D14-2', 'SK-D16-1'] },
  { id: 'C3', name: '货舱冷藏回路 C3', capacityKw: 12, socketIds: ['SK-H08-1', 'SK-H10-1', 'SK-H12-1'] }
];

const initialSockets: ReeferSocket[] = [
  { id: 'SK-D10-1', circuitId: 'C1', deck: '主甲板', bay: 10 },
  { id: 'SK-D10-2', circuitId: 'C1', deck: '主甲板', bay: 10 },
  { id: 'SK-D12-1', circuitId: 'C1', deck: '主甲板', bay: 12 },
  { id: 'SK-D12-2', circuitId: 'C1', deck: '主甲板', bay: 12 },
  { id: 'SK-D13-1', circuitId: 'C1', deck: '主甲板', bay: 13 },
  { id: 'SK-D13-2', circuitId: 'C1', deck: '主甲板', bay: 13 },
  { id: 'SK-D14-1', circuitId: 'C2', deck: '主甲板', bay: 14 },
  { id: 'SK-D14-2', circuitId: 'C2', deck: '主甲板', bay: 14 },
  { id: 'SK-D16-1', circuitId: 'C2', deck: '主甲板', bay: 16 },
  { id: 'SK-H08-1', circuitId: 'C3', deck: '货舱', bay: 8 },
  { id: 'SK-H10-1', circuitId: 'C3', deck: '货舱', bay: 10 },
  { id: 'SK-H12-1', circuitId: 'C3', deck: '货舱', bay: 12 }
];

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// 旧稿迁移：缺少冷藏回路数据的本地稿升级成首版（schemaVersion 1）
// ---------------------------------------------------------------------------
const CURRENT_SCHEMA = 1;

function migrate(raw: Partial<State> | null): State {
  const base: State = {
    schemaVersion: CURRENT_SCHEMA,
    legacyUpgraded: false,
    cargo: initialCargo,
    circuits: initialCircuits,
    sockets: initialSockets,
    activeCargoId: 'BL-88247',
    planRevision: 5,
    comments: [
      { id: 'CM-21', cargoId: 'BL-88219', author: '港方配载', role: '码头', content: '危险品箱与船员生活区保持隔离，请在最终图中标注危险品隔离线。', status: '待确认' },
      { id: 'CM-22', cargoId: 'BL-88247', author: '周船长', role: '船长', content: '重大件横向支撑需增加两组绑扎点，检查甲板局部强度。', status: '待确认' },
      { id: 'CM-23', cargoId: 'BL-88254', author: '货主代表', role: '货主', content: '釜山港卸货前不得覆盖散货舱口，已接受当前安排。', status: '已接受' }
    ],
    acceptedLimits: [],
    locked: false,
    viewMode: '3d',
    draftSavedAt: '09:52',
    review: null,
    online: true,
    offlineQueue: [],
    processedRecordIds: [],
    socketLog: [],
    lastResult: null
  };
  if (!raw) return base;

  const migrated: State = { ...base, ...raw } as State;
  migrated.schemaVersion = CURRENT_SCHEMA;
  migrated.circuits ??= initialCircuits;
  migrated.sockets ??= initialSockets;
  migrated.review ??= null;
  migrated.online ??= true;
  migrated.offlineQueue ??= [];
  migrated.processedRecordIds ??= [];
  migrated.socketLog ??= [];
  migrated.lastResult ??= null;

  // 旧稿缺少回路数据 → 升级成首版，复核结论一律失效，要求重新开航校核
  if (!Array.isArray(raw.circuits) || !Array.isArray(raw.sockets)) {
    migrated.legacyUpgraded = true;
    migrated.review = null;
  }
  // 旧货物行缺少冷藏字段时补齐为普通货
  migrated.cargo = migrated.cargo.map((item) =>
    item.reefer ? item : { ...item, reefer: { reefer: false, kw: 0, socketId: null } }
  );
  // 引用了不存在插座的冷藏箱一律退回未接入状态
  const socketIds = new Set(migrated.sockets.map((socket) => socket.id));
  migrated.cargo = migrated.cargo.map((item) =>
    item.reefer?.reefer && item.reefer.socketId && !socketIds.has(item.reefer.socketId)
      ? { ...item, reefer: { ...item.reefer, socketId: null } }
      : item
  );
  return migrated;
}

const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy62-stowage-plan') : null;
const initialState = migrate(raw ? JSON.parse(raw) : null);

// ---------------------------------------------------------------------------
// 冷藏供电开航校核
// ---------------------------------------------------------------------------
export type CircuitLoad = {
  circuit: PowerCircuit;
  /** 剩余功率按已分配（占用插座）箱数逐箱扣减 */
  usedKw: number;
  remainingKw: number;
  overloaded: boolean;
  assignment: { cargo: Cargo; socket: ReeferSocket }[];
};

export type PowerIssue = {
  id: string;
  cargoId: string;
  level: 'high' | 'medium';
  title: string;
  detail: string;
  alternatives: string[];
};

export function circuitLoads(cargo: Cargo[], circuits: PowerCircuit[], sockets: ReeferSocket[]): CircuitLoad[] {
  return circuits.map((circuit) => {
    const socketMap = new Map(sockets.filter((socket) => socket.circuitId === circuit.id).map((socket) => [socket.id, socket]));
    const assignment = cargo
      .filter((item) => item.reefer?.reefer && item.reefer.socketId && socketMap.has(item.reefer.socketId))
      .map((item) => ({ cargo: item, socket: socketMap.get(item.reefer!.socketId!)! }));
    const usedKw = assignment.reduce((sum, entry) => sum + entry.cargo.reefer!.kw, 0);
    return { circuit, usedKw, remainingKw: circuit.capacityKw - usedKw, overloaded: usedKw > circuit.capacityKw, assignment };
  });
}

/** 同一回路内尚有剩余功率的空闲插座，按距冷藏箱当前 Bay 的远近排序作为替代货位 */
export function freeAlternatives(cargo: Cargo[], circuits: PowerCircuit[], sockets: ReeferSocket[], cargoId: string, excludeSocketId?: string, limit = 3) {
  const target = cargo.find((item) => item.id === cargoId);
  const loads = new Map(circuitLoads(cargo, circuits, sockets).map((load) => [load.circuit.id, load]));
  const occupied = new Set(cargo.filter((item) => item.reefer?.socketId).map((item) => item.reefer!.socketId!));
  return sockets
    .filter((socket) => socket.id !== excludeSocketId && !occupied.has(socket.id))
    .filter((socket) => (loads.get(socket.circuitId)?.remainingKw ?? 0) >= (target?.reefer?.kw ?? 0))
    .sort((a, b) => Math.abs(a.bay - (target?.bay ?? 0)) - Math.abs(b.bay - (target?.bay ?? 0)))
    .slice(0, limit)
    .map((socket) => {
      const load = loads.get(socket.circuitId)!;
      return `${socket.id}（${socket.deck} B${socket.bay} · ${load.circuit.name} 余 ${load.remainingKw.toFixed(1)}kW）`;
    });
}

export function evaluatePower(cargo: Cargo[], circuits: PowerCircuit[], sockets: ReeferSocket[]): PowerIssue[] {
  const issues: PowerIssue[] = [];
  const loads = circuitLoads(cargo, circuits, sockets);
  const socketMap = new Map(sockets.map((socket) => [socket.id, socket]));

  cargo
    .filter((item) => item.reefer?.reefer)
    .forEach((item) => {
      const socketId = item.reefer!.socketId;
      if (!socketId) {
        const alternatives = freeAlternatives(cargo, circuits, sockets, item.id);
        issues.push({
          id: `${item.id}-unpowered`,
          cargoId: item.id,
          level: 'high',
          title: '冷藏箱未接入供电',
          detail: `${item.id}（${item.reefer!.kw}kW）尚未占用插座，旧稿按插座总数误判为可用，开航校核按已分配箱数扣减后不得放行。`,
          alternatives
        });
        return;
      }
      const socket = socketMap.get(socketId);
      if (!socket) {
        issues.push({ id: `${item.id}-badsocket`, cargoId: item.id, level: 'high', title: '插座回路数据缺失', detail: `${item.id} 引用的 ${socketId} 不在供电回路数据中。`, alternatives: freeAlternatives(cargo, circuits, sockets, item.id) });
      }
    });

  loads.forEach((load) => {
    if (load.overloaded) {
      load.assignment.forEach(({ cargo: item }) => {
        issues.push({
          id: `${item.id}-overload-${load.circuit.id}`,
          cargoId: item.id,
          level: 'high',
          title: `供电回路超限 · ${load.circuit.name}`,
          detail: `${item.id} 接入后回路已用 ${load.usedKw.toFixed(1)}kW / 额定 ${load.circuit.capacityKw}kW，超限 ${(load.usedKw - load.circuit.capacityKw).toFixed(1)}kW。`,
          alternatives: freeAlternatives(cargo, circuits, sockets, item.id, item.reefer!.socketId ?? undefined)
        });
      });
    }
  });
  return issues;
}

type SubmissionOutcome = {
  outcome: SocketEvent['outcome'];
  detail: string;
  alternatives?: string[];
  holder?: string;
};

/**
 * 两名值班员同时提交同一插座时的仲裁：先确认者保持占用，后到者看到冲突。
 * 同一调用内按提交顺序逐笔处理，空闲且回路有余量才确认占用。
 */
function evaluateSubmission(cargo: Cargo[], circuits: PowerCircuit[], sockets: ReeferSocket[], payload: { cargoId: string; socketId: string }): SubmissionOutcome {
  const item = cargo.find((entry) => entry.id === payload.cargoId);
  const socket = sockets.find((entry) => entry.id === payload.socketId);
  if (!item?.reefer?.reefer) return { outcome: 'conflict', detail: `${payload.cargoId} 不是冷藏箱，不能占用冷藏插座。` };
  if (!socket) return { outcome: 'conflict', detail: `插座 ${payload.socketId} 不存在。` };

  const holder = cargo.find((entry) => entry.reefer?.socketId === payload.socketId && entry.id !== payload.cargoId);
  if (holder) {
    return {
      outcome: 'conflict',
      holder: holder.id,
      detail: `插座 ${payload.socketId} 已由先确认的 ${holder.id} 占用，后到者（${payload.cargoId}）看到冲突，本次提交不占用。`,
      alternatives: freeAlternatives(cargo, circuits, sockets, payload.cargoId, payload.socketId)
    };
  }

  const load = circuitLoads(cargo, circuits, sockets).find((entry) => entry.circuit.id === socket.circuitId)!;
  const remaining = load.remainingKw + (item.reefer.socketId === payload.socketId ? item.reefer.kw : 0);
  if (remaining < item.reefer.kw) {
    return {
      outcome: 'overload',
      detail: `${payload.socketId} 所在 ${load.circuit.name} 剩余 ${remaining.toFixed(1)}kW，无法满足 ${payload.cargoId} 的 ${item.reefer.kw}kW 需求。`,
      alternatives: freeAlternatives(cargo, circuits, sockets, payload.cargoId, payload.socketId)
    };
  }
  return { outcome: 'confirmed', detail: `${payload.cargoId} 确认占用 ${payload.socketId}，剩余功率已按已分配箱数扣减 ${item.reefer.kw}kW。` };
}

type StowageIssue = { id: string; cargoId: string; level: 'high' | 'medium'; title: string; detail: string };
type AnyIssue = StowageIssue | PowerIssue;

export function planIssues(cargo: Cargo[], circuits: PowerCircuit[], sockets: ReeferSocket[]): AnyIssue[] {
  return [...detectConflicts(cargo), ...evaluatePower(cargo, circuits, sockets)];
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------
const slice = createSlice({
  name: 'stowage',
  initialState,
  reducers: {
    selectCargo(state, action: PayloadAction<string>) { state.activeCargoId = action.payload; },
    moveCargo(state, action: PayloadAction<{ id: string; bay: number; row: number; tier: number }>) {
      if (state.locked) return;
      const cargo = state.cargo.find((item) => item.id === action.payload.id);
      if (cargo) Object.assign(cargo, action.payload);
      // 货位变化：隔离与稳性结论立即失效（复核 revision 与当前版本不再一致）
      state.planRevision += 1;
      state.draftSavedAt = nowTime().slice(0, 5);
    },
    updateLashing(state, action: PayloadAction<{ id: string; lashing: Cargo['lashing'] }>) {
      const cargo = state.cargo.find((item) => item.id === action.payload.id);
      if (cargo) cargo.lashing = action.payload.lashing;
    },
    addComment(state, action: PayloadAction<{ cargoId: string; author: string; role: StowageComment['role']; content: string }>) {
      state.comments.unshift({ ...action.payload, id: `CM-${Date.now()}`, status: '待确认' });
    },
    acceptComment(state, action: PayloadAction<string>) {
      const comment = state.comments.find((item) => item.id === action.payload);
      if (comment) comment.status = '已接受';
    },
    rejectComment(state, action: PayloadAction<string>) {
      const comment = state.comments.find((item) => item.id === action.payload);
      if (comment) comment.status = '已退回';
    },
    acceptLimit(state, action: PayloadAction<string>) {
      if (!state.acceptedLimits.includes(action.payload)) state.acceptedLimits.push(action.payload);
    },
    setViewMode(state, action: PayloadAction<'3d' | 'section'>) { state.viewMode = action.payload; },

    // 值班员确认占用插座（并发时按调用顺序逐笔仲裁）
    confirmSocket(state, action: PayloadAction<{ cargoId: string; socketId: string; officer: string }>) {
      if (state.locked) return;
      const result = evaluateSubmission(state.cargo, state.circuits, state.sockets, action.payload);
      const event: SocketEvent = { id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: nowTime(), ...action.payload, outcome: result.outcome, detail: result.detail, alternatives: result.alternatives };
      state.socketLog.unshift(event);
      state.lastResult = event;
      if (result.outcome === 'confirmed') {
        const item = state.cargo.find((entry) => entry.id === action.payload.cargoId);
        if (item?.reefer) {
          item.reefer.socketId = action.payload.socketId;
          state.planRevision += 1;
          state.draftSavedAt = nowTime().slice(0, 5);
        }
      }
    },
    releaseSocket(state, action: PayloadAction<string>) {
      if (state.locked) return;
      const item = state.cargo.find((entry) => entry.id === action.payload);
      if (item?.reefer?.socketId) {
        const socketId = item.reefer.socketId;
        item.reefer.socketId = null;
        state.socketLog.unshift({ id: `EV-${Date.now()}`, at: nowTime(), cargoId: item.id, socketId, officer: '值班员', outcome: 'confirmed', detail: `${item.id} 释放 ${socketId}，该插座剩余功率恢复。` });
        state.planRevision += 1;
      }
    },
    // 回路变化：隔离/稳性/供电结论立即失效
    updateCircuitCapacity(state, action: PayloadAction<{ id: string; capacityKw: number }>) {
      if (state.locked) return;
      const circuit = state.circuits.find((item) => item.id === action.payload.id);
      if (circuit) {
        circuit.capacityKw = action.payload.capacityKw;
        state.planRevision += 1;
      }
    },

    setOffline(state) { state.online = false; },
    setOnline(state) {
      if (state.online || state.locked) { state.online = true; return; }
      // 回连：按插座合并断网记录，逐插座只接受先确认的一笔，重复上传不重复扣减
      const groups = new Map<string, OfflineRecord[]>();
      state.offlineQueue.forEach((record) => {
        const list = groups.get(record.socketId) ?? [];
        list.push(record);
        groups.set(record.socketId, list);
      });
      let changed = false;
      groups.forEach((records) => {
        const sorted = [...records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
        sorted.forEach((record, index) => {
          const duplicate = state.processedRecordIds.includes(record.clientId);
          if (duplicate) {
            state.socketLog.unshift({ id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: nowTime(), cargoId: record.cargoId, socketId: record.socketId, officer: record.officer, outcome: 'duplicate', detail: `断网记录 ${record.clientId} 重复上传，已按去重丢弃，不重复扣减功率。` });
            return;
          }
          const result = evaluateSubmission(state.cargo, state.circuits, state.sockets, record);
          state.processedRecordIds.push(record.clientId);
          if (index > 0 || result.outcome !== 'confirmed') {
            state.socketLog.unshift({ id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: nowTime(), cargoId: record.cargoId, socketId: record.socketId, officer: record.officer, outcome: result.outcome === 'confirmed' ? 'conflict' : result.outcome, detail: index > 0 ? `同一插座 ${record.socketId} 的断网记录合并：先确认者已占用，${record.cargoId} 的后到记录不重复扣减。` : result.detail, alternatives: result.alternatives });
            return;
          }
          const item = state.cargo.find((entry) => entry.id === record.cargoId);
          if (item?.reefer) {
            item.reefer.socketId = record.socketId;
            changed = true;
            state.socketLog.unshift({ id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: nowTime(), cargoId: record.cargoId, socketId: record.socketId, officer: record.officer, outcome: 'confirmed', detail: `回连合并：${record.cargoId} 对 ${record.socketId} 的断网确认生效，功率扣减一次。` });
          }
        });
      });
      if (changed) state.planRevision += 1;
      state.offlineQueue = [];
      state.online = true;
    },
    enqueueOffline(state, action: PayloadAction<Partial<OfflineRecord> & { cargoId: string; socketId: string; officer: string }>) {
      state.offlineQueue.push({
        clientId: action.payload.clientId ?? `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        recordedAt: action.payload.recordedAt ?? nowTime(),
        cargoId: action.payload.cargoId,
        socketId: action.payload.socketId,
        officer: action.payload.officer
      });
    },

    // 复核：高等级（阻断）问题未清零则不能通过
    completeReview(state, action: PayloadAction<string>) {
      const issues = planIssues(state.cargo, state.circuits, state.sockets);
      const blockers = issues.filter((issue) => issue.level === 'high');
      state.review = blockers.length
        ? { revision: state.review?.revision ?? 0, passed: false, checkedAt: nowTime(), note: `复核未通过：${blockers.length} 项阻断问题待处理（${blockers.map((issue) => issue.title).join('、')}）。` }
        : { revision: state.planRevision, passed: true, checkedAt: nowTime(), note: action.payload };
    },
    lockPlan(state) {
      // 复核完成前（或结论已失效）不能锁定
      if (state.locked || !isReviewCurrent(state)) return;
      state.locked = true;
    }
  }
});

export const {
  selectCargo, moveCargo, updateLashing, addComment, acceptComment, rejectComment, acceptLimit,
  setViewMode, confirmSocket, releaseSocket, updateCircuitCapacity,
  setOffline, setOnline, enqueueOffline, completeReview, lockPlan
} = slice.actions;

export const store = configureStore({
  reducer: { stowage: slice.reducer, [stowageApi.reducerPath]: stowageApi.reducer },
  middleware: (getDefault) => getDefault().concat(stowageApi.middleware)
});

store.subscribe(() => {
  if (typeof localStorage !== 'undefined') localStorage.setItem('yy62-stowage-plan', JSON.stringify(store.getState().stowage));
});

export type RootState = ReturnType<typeof store.getState>;

// ---------------------------------------------------------------------------
// 复核状态派生：货位或回路变化后，隔离/稳性/供电结论立即失效
// ---------------------------------------------------------------------------
export function isReviewCurrent(state: State) {
  return !!state.review?.passed && state.review.revision === state.planRevision;
}

export function canLockPlan(state: State) {
  return !state.locked && isReviewCurrent(state);
}

export function canPrintPlan(state: State) {
  return isReviewCurrent(state);
}

export function calculateStability(cargo: Cargo[]) {
  const total = cargo.reduce((sum, item) => sum + item.weight, 0);
  const longitudinal = cargo.reduce((sum, item) => sum + item.weight * item.bay, 0) / Math.max(total, 1);
  const vertical = cargo.reduce((sum, item) => sum + item.weight * (item.tier + 1), 0) / Math.max(total, 1);
  const deckLoad = cargo.filter((item) => item.deck === '主甲板').reduce((sum, item) => sum + item.weight, 0);
  const stability = Math.max(0, 92 - Math.abs(longitudinal - 10.8) * 2.2 - Math.max(0, vertical - 1.75) * 8);
  return {
    total,
    longitudinal,
    vertical,
    deckLoad,
    stability,
    trim: (longitudinal - 10.8) < -0.4 ? '艉倾' : (longitudinal - 10.8) > 0.4 ? '艏倾' : '正平'
  };
}

export function detectConflicts(cargo: Cargo[]): StowageIssue[] {
  const issues: StowageIssue[] = [];
  const slots = new Map<string, Cargo>();
  cargo.forEach((item) => {
    const key = `${item.deck}-${item.bay}-${item.row}-${item.tier}`;
    const existing = slots.get(key);
    if (existing) issues.push({ id: `${item.id}-overlap`, cargoId: item.id, level: 'high', title: '货位重叠', detail: `${item.id} 与 ${existing.id} 占用相同二维货位。` });
    slots.set(key, item);
    if (item.hazmat !== '无' && item.deck === '主甲板' && item.row <= 1) issues.push({ id: `${item.id}-hazmat`, cargoId: item.id, level: 'high', title: '危险品隔离不足', detail: `${item.id} 与船体边界距离小于方案要求。` });
    if (item.weight > 100 && item.lashing !== '已绑扎') issues.push({ id: `${item.id}-lashing`, cargoId: item.id, level: 'medium', title: '重大件绑扎未完成', detail: `${item.id} 重量 ${item.weight}t，绑扎状态为“${item.lashing}”。` });
    if (item.type === '集装箱' && item.weight > 30 && item.tier >= 3) issues.push({ id: `${item.id}-stack`, cargoId: item.id, level: 'medium', title: '上层堆重超限', detail: `${item.id} 不应放在第 ${item.tier} 层。` });
  });
  return issues;
}
