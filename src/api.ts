import { createApi } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';

export type CargoType = '集装箱' | '散货' | '重大件';
export type Cargo = {
  id: string;
  bill: string;
  type: CargoType;
  bay: number;
  row: number;
  tier: number;
  deck: '主甲板' | '货舱';
  weight: number;
  dimension: string;
  port: string;
  hazmat: string;
  lashing: '已绑扎' | '待绑扎' | '需复核';
  color: string;
  reefer?: boolean;
  powerKw?: number;
};

export type ReeferSocket = {
  id: string;
  code: string;
  circuitId: string;
  bay: number;
  row: number;
  tier: number;
  deck: '主甲板' | '货舱';
  status: 'free' | 'occupied';
  occupiedBy?: string;
  officer?: string;
  confirmedAt?: string;
};

export type PowerCircuit = {
  id: string;
  name: string;
  capacityKw: number;
  sockets: ReeferSocket[];
};

export type OfflineRecord = {
  id: string;
  socketId: string;
  cargoId: string;
  action: 'claim' | 'release';
  officer: string;
  at: string;
  status: 'pending' | 'uploaded' | 'conflict';
  conflictBy?: string;
};

export const REEFER_POWER_KW = 7.5;

export function reeferPower(cargo: Cargo): number {
  return cargo.powerKw ?? REEFER_POWER_KW;
}

/** 首版供电回路数据：旧草稿缺少回路数据时由此升级。 */
export function defaultCircuits(): PowerCircuit[] {
  const defs: { id: string; name: string; capacityKw: number; sockets: Omit<ReeferSocket, 'status'>[] }[] = [
    {
      id: 'C1', name: '主甲板左舷回路', capacityKw: 15,
      sockets: [
        { id: 'S-C1-04', code: 'RF-040', circuitId: 'C1', bay: 4, row: 0, tier: 2, deck: '主甲板' },
        { id: 'S-C1-06', code: 'RF-060', circuitId: 'C1', bay: 6, row: 0, tier: 1, deck: '主甲板' },
        { id: 'S-C1-08', code: 'RF-080', circuitId: 'C1', bay: 8, row: 0, tier: 2, deck: '主甲板' }
      ]
    },
    {
      id: 'C2', name: '主甲板右舷回路', capacityKw: 15,
      sockets: [
        { id: 'S-C2-04', code: 'RF-043', circuitId: 'C2', bay: 4, row: 3, tier: 2, deck: '主甲板' },
        { id: 'S-C2-06', code: 'RF-063', circuitId: 'C2', bay: 6, row: 3, tier: 1, deck: '主甲板' },
        { id: 'S-C2-08', code: 'RF-083', circuitId: 'C2', bay: 8, row: 3, tier: 2, deck: '主甲板' }
      ]
    },
    {
      id: 'C3', name: '货舱冷藏回路', capacityKw: 15,
      sockets: [
        { id: 'S-C3-05', code: 'RF-051', circuitId: 'C3', bay: 5, row: 1, tier: 1, deck: '货舱' },
        { id: 'S-C3-07', code: 'RF-071', circuitId: 'C3', bay: 7, row: 1, tier: 1, deck: '货舱' }
      ]
    }
  ];
  const circuits: PowerCircuit[] = defs.map((d) => ({
    id: d.id,
    name: d.name,
    capacityKw: d.capacityKw,
    sockets: d.sockets.map((s) => ({ ...s, status: 'free' as const }))
  }));
  const c1 = circuits.find((c) => c.id === 'C1')!;
  const s04 = c1.sockets.find((s) => s.id === 'S-C1-04')!;
  s04.status = 'occupied'; s04.occupiedBy = 'BL-88214'; s04.officer = '王值班'; s04.confirmedAt = '2026-10-02T09:30:00+08:00';
  const s06 = c1.sockets.find((s) => s.id === 'S-C1-06')!;
  s06.status = 'occupied'; s06.occupiedBy = 'BL-88231'; s06.officer = '王值班'; s06.confirmedAt = '2026-10-02T09:31:00+08:00';
  return circuits;
}

export type SocketWithCargo = { socket: ReeferSocket; cargo?: Cargo };
export type CircuitAnalysis = {
  circuit: PowerCircuit;
  usedKw: number;
  remainingKw: number;
  usedBoxes: number;
  capacityBoxes: number;
  overloaded: boolean;
  entries: SocketWithCargo[];
};

/** 按回路统计已分配冷藏箱与剩余功率（按箱数扣减）。 */
export function analyzeCircuits(cargo: Cargo[], circuits: PowerCircuit[]): CircuitAnalysis[] {
  return circuits.map((circuit) => {
    const entries: SocketWithCargo[] = circuit.sockets.map((socket) => ({
      socket,
      cargo: socket.occupiedBy ? cargo.find((item) => item.id === socket.occupiedBy) : undefined
    }));
    const usedKw = entries.reduce((sum, e) => sum + (e.cargo?.reefer ? reeferPower(e.cargo) : 0), 0);
    const usedBoxes = entries.filter((e) => e.cargo?.reefer).length;
    return {
      circuit,
      usedKw,
      remainingKw: circuit.capacityKw - usedKw,
      usedBoxes,
      capacityBoxes: Math.floor(circuit.capacityKw / REEFER_POWER_KW),
      overloaded: usedKw > circuit.capacityKw,
      entries
    };
  });
}

export type Alternative = {
  cargo: Cargo;
  fromSocket?: ReeferSocket;
  alternatives: { socket: ReeferSocket; circuit: PowerCircuit; remainingAfter: number }[];
};

/** 为超载回路或未接电的冷藏箱寻找仍有剩余功率的替代货位（按同甲板、就近 Bay 排序）。 */
export function suggestAlternatives(cargo: Cargo[], circuits: PowerCircuit[]): Alternative[] {
  const analysis = analyzeCircuits(cargo, circuits);
  const byCircuit = new Map(analysis.map((a) => [a.circuit.id, a]));
  const result: Alternative[] = [];
  cargo.filter((c) => c.reefer).forEach((c) => {
    const fromSocket = circuits.flatMap((cir) => cir.sockets).find((s) => s.occupiedBy === c.id);
    const currentCircuit = fromSocket ? circuits.find((cir) => cir.id === fromSocket.circuitId) : undefined;
    const currentOverloaded = currentCircuit ? byCircuit.get(currentCircuit.id)!.overloaded : true;
    if (!currentOverloaded && fromSocket) return;
    const alts: Alternative['alternatives'] = [];
    circuits.forEach((cir) => {
      const a = byCircuit.get(cir.id)!;
      cir.sockets.forEach((socket) => {
        if (socket.status !== 'free') return;
        const remainingAfter = a.remainingKw - reeferPower(c);
        if (remainingAfter >= 0) alts.push({ socket, circuit: cir, remainingAfter });
      });
    });
    alts.sort((x, y) => {
      const deckDiff = (x.socket.deck === c.deck ? 0 : 1) - (y.socket.deck === c.deck ? 0 : 1);
      if (deckDiff) return deckDiff;
      return Math.abs(x.socket.bay - c.bay) - Math.abs(y.socket.bay - c.bay);
    });
    result.push({ cargo: c, fromSocket, alternatives: alts.slice(0, 3) });
  });
  return result;
}

const voyageData = {
  id: 'V-2609-17',
  vessel: '海岳轮',
  imo: 'IMO 9782214',
  route: '上海 → 釜山 → 温哥华',
  departure: '2026-10-02 14:00',
  revision: 5,
  cargo: [
    { id: 'BL-88214', bill: 'SEA-88214', type: '集装箱', bay: 12, row: 4, tier: 2, deck: '主甲板', weight: 24.6, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2b7c75', reefer: true, powerKw: 7.5 },
    { id: 'BL-88219', bill: 'SEA-88219', type: '集装箱', bay: 13, row: 4, tier: 2, deck: '主甲板', weight: 28.1, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: 'UN 1263', lashing: '需复核', color: '#c77835' },
    { id: 'BL-88231', bill: 'SEA-88231', type: '集装箱', bay: 10, row: 6, tier: 1, deck: '主甲板', weight: 18.2, dimension: '20 × 8 × 8.6 ft', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#366d94', reefer: true, powerKw: 7.5 },
    { id: 'BL-88240', bill: 'SEA-88240', type: '集装箱', bay: 8, row: 2, tier: 2, deck: '货舱', weight: 31.4, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '待绑扎', color: '#6d528d', reefer: true, powerKw: 7.5 },
    { id: 'BL-88247', bill: 'SEA-88247', type: '重大件', bay: 15, row: 0, tier: 1, deck: '主甲板', weight: 112.5, dimension: '18.4 × 4.2 × 4.8 m', port: '温哥华', hazmat: '无', lashing: '需复核', color: '#b64f49' },
    { id: 'BL-88254', bill: 'SEA-88254', type: '散货', bay: 5, row: 0, tier: 0, deck: '货舱', weight: 286.0, dimension: '散装 / 420 m³', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#9a7836' }
  ] as Cargo[]
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 服务端回路状态（模拟）。 */
let circuitsState: PowerCircuit[] = defaultCircuits();
/** 已处理的客户端幂等键：重复上传不重复扣减功率。 */
const appliedRecordIds = new Set<string>();

function findSocket(socketId: string): ReeferSocket | undefined {
  return circuitsState.flatMap((c) => c.sockets).find((s) => s.id === socketId);
}

export type ClaimResult =
  | { ok: true; duplicated?: boolean; socket: ReeferSocket }
  | { ok: false; duplicated?: boolean; conflict?: { socketId: string; cargoId?: string; officer?: string; at?: string }; error?: string };

async function handleClaim(body: { socketId: string; cargoId: string; officer: string; clientId?: string }): Promise<ClaimResult> {
  const { socketId, cargoId, officer, clientId } = body;
  if (clientId && appliedRecordIds.has(clientId)) {
    return { ok: true, duplicated: true, socket: findSocket(socketId)! };
  }
  const socket = findSocket(socketId);
  if (!socket) return { ok: false, error: 'no-socket' };
  if (socket.status === 'occupied' && socket.occupiedBy !== cargoId) {
    return { ok: false, conflict: { socketId, cargoId: socket.occupiedBy, officer: socket.officer, at: socket.confirmedAt } };
  }
  socket.status = 'occupied';
  socket.occupiedBy = cargoId;
  socket.officer = officer;
  socket.confirmedAt = new Date().toISOString();
  if (clientId) appliedRecordIds.add(clientId);
  return { ok: true, socket };
}

async function handleRelease(body: { socketId: string; clientId?: string }): Promise<{ ok: boolean; duplicated?: boolean }> {
  const { socketId, clientId } = body;
  if (clientId && appliedRecordIds.has(clientId)) return { ok: true, duplicated: true };
  const socket = findSocket(socketId);
  if (!socket) return { ok: false };
  socket.status = 'free';
  delete socket.occupiedBy;
  delete socket.officer;
  delete socket.confirmedAt;
  if (clientId) appliedRecordIds.add(clientId);
  return { ok: true };
}

export type SyncResult = {
  ok: boolean;
  uploaded: number;
  merged: number;
  duplicates: number;
  conflicts: number;
  conflictResults: { socketId: string; officer?: string; at?: string }[];
};

/** 断网记录回连后按插座合并上传；幂等键去重，重复上传不重复扣减。 */
async function handleSync(records: OfflineRecord[]): Promise<SyncResult> {
  let uploaded = 0;
  let duplicates = 0;
  let conflicts = 0;
  const conflictResults: SyncResult['conflictResults'] = [];
  const bySocket = new Map<string, OfflineRecord[]>();
  records.forEach((r) => {
    if (!bySocket.has(r.socketId)) bySocket.set(r.socketId, []);
    bySocket.get(r.socketId)!.push(r);
  });
  bySocket.forEach((list, socketId) => {
    list.sort((a, b) => a.at.localeCompare(b.at));
    list.forEach((r) => {
      if (appliedRecordIds.has(r.id)) {
        duplicates += 1;
        return;
      }
      appliedRecordIds.add(r.id);
      uploaded += 1;
      const socket = findSocket(socketId);
      if (!socket) return;
      if (r.action === 'release') {
        socket.status = 'free';
        delete socket.occupiedBy;
        delete socket.officer;
        delete socket.confirmedAt;
        return;
      }
      if (socket.status === 'occupied' && socket.occupiedBy !== r.cargoId) {
        conflicts += 1;
        conflictResults.push({ socketId, officer: socket.officer, at: socket.confirmedAt });
        return;
      }
      socket.status = 'occupied';
      socket.occupiedBy = r.cargoId;
      socket.officer = r.officer;
      socket.confirmedAt = r.at;
    });
  });
  return { ok: true, uploaded, merged: bySocket.size, duplicates, conflicts, conflictResults };
}

const mockBaseQuery: BaseQueryFn = async (arg) => {
  await delay(180);
  if (typeof arg === 'object' && arg && 'url' in arg) {
    const { url, body } = arg as { url: string; body?: unknown };
    if (url === 'voyage') return { data: voyageData };
    if (url === 'circuits') return { data: circuitsState };
    if (url === 'claimSocket') return { data: await handleClaim(body as { socketId: string; cargoId: string; officer: string; clientId?: string }) };
    if (url === 'releaseSocket') return { data: await handleRelease(body as { socketId: string; clientId?: string }) };
    if (url === 'syncOffline') return { data: await handleSync(body as OfflineRecord[]) };
  }
  return { error: { status: 404, data: 'Not found' } };
};

export const stowageApi = createApi({
  reducerPath: 'stowageApi',
  baseQuery: mockBaseQuery,
  tagTypes: ['Voyage', 'Circuits'],
  endpoints: (builder) => ({
    getVoyage: builder.query<typeof voyageData, void>({ query: () => 'voyage', providesTags: ['Voyage'] }),
    getCircuits: builder.query<PowerCircuit[], void>({
      query: () => 'circuits',
      providesTags: (result) => (result ? [...result.map((c) => ({ type: 'Circuits' as const, id: c.id })), 'Circuits'] : ['Circuits'])
    }),
    claimSocket: builder.mutation<ClaimResult, { socketId: string; cargoId: string; officer: string; clientId?: string }>({
      query: (body) => ({ url: 'claimSocket', method: 'POST', body }),
      invalidatesTags: ['Circuits']
    }),
    releaseSocket: builder.mutation<{ ok: boolean; duplicated?: boolean }, { socketId: string; clientId?: string }>({
      query: (body) => ({ url: 'releaseSocket', method: 'POST', body }),
      invalidatesTags: ['Circuits']
    }),
    syncOffline: builder.mutation<SyncResult, OfflineRecord[]>({
      query: (body) => ({ url: 'syncOffline', method: 'POST', body }),
      invalidatesTags: ['Circuits']
    })
  })
});

export const { useGetVoyageQuery, useGetCircuitsQuery, useClaimSocketMutation, useReleaseSocketMutation, useSyncOfflineMutation } = stowageApi;
