import { createApi } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';

export type CargoType = '集装箱' | '散货' | '重大件';
export type ReeferInfo = {
  reefer: boolean;
  /** 冷藏箱制冷功率（kW） */
  kw: number;
  /** 当前占用的插座 id；未接入供电时为 null */
  socketId: string | null;
};
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
  reefer?: ReeferInfo;
};

export type PowerCircuit = {
  id: string;
  name: string;
  /** 回路额定容量（kW） */
  capacityKw: number;
  socketIds: string[];
};

export type ReeferSocket = {
  id: string;
  circuitId: string;
  deck: '主甲板' | '货舱';
  bay: number;
};

const reefers = {
  BL88214: { reefer: true, kw: 6, socketId: 'SK-D12-1' },
  BL88219: { reefer: true, kw: 9, socketId: 'SK-D13-1' },
  BL88231: { reefer: true, kw: 4, socketId: 'SK-H10-1' }
} as const;

const voyageData = {
  id: 'V-2609-17',
  vessel: '海岳轮',
  imo: 'IMO 9782214',
  route: '上海 → 釜山 → 温哥华',
  departure: '2026-10-02 14:00',
  revision: 5,
  cargo: [
    { id: 'BL-88214', bill: 'SEA-88214', type: '集装箱', bay: 12, row: 4, tier: 2, deck: '主甲板', weight: 24.6, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2b7c75', reefer: reefers.BL88214 },
    { id: 'BL-88219', bill: 'SEA-88219', type: '集装箱', bay: 13, row: 4, tier: 2, deck: '主甲板', weight: 28.1, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: 'UN 1263', lashing: '需复核', color: '#c77835', reefer: reefers.BL88219 },
    { id: 'BL-88231', bill: 'SEA-88231', type: '集装箱', bay: 10, row: 6, tier: 1, deck: '主甲板', weight: 18.2, dimension: '20 × 8 × 8.6 ft', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#366d94', reefer: reefers.BL88231 },
    { id: 'BL-88240', bill: 'SEA-88240', type: '集装箱', bay: 8, row: 2, tier: 2, deck: '货舱', weight: 31.4, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '待绑扎', color: '#6d528d' },
    { id: 'BL-88247', bill: 'SEA-88247', type: '重大件', bay: 15, row: 0, tier: 1, deck: '主甲板', weight: 112.5, dimension: '18.4 × 4.2 × 4.8 m', port: '温哥华', hazmat: '无', lashing: '需复核', color: '#b64f49' },
    { id: 'BL-88254', bill: 'SEA-88254', type: '散货', bay: 5, row: 0, tier: 0, deck: '货舱', weight: 286.0, dimension: '散装 / 420 m³', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#9a7836' },
    // 待接入供电的冷藏箱：用于开航校核演示（未占用插座即视为供电缺失）
    { id: 'BL-88260', bill: 'SEA-88260', type: '集装箱', bay: 11, row: 2, tier: 1, deck: '主甲板', weight: 21.7, dimension: '20 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2f87a4', reefer: { reefer: true, kw: 5, socketId: null } }
  ] as Cargo[],
  // 冷藏供电回路与插座数据：旧稿（缺少本字段）在本地状态载入时升级为首版
  circuits: [
    { id: 'C1', name: '主甲板冷藏回路 C1', capacityKw: 18, socketIds: ['SK-D10-1', 'SK-D10-2', 'SK-D12-1', 'SK-D12-2', 'SK-D13-1', 'SK-D13-2'] },
    { id: 'C2', name: '主甲板冷藏回路 C2', capacityKw: 30, socketIds: ['SK-D14-1', 'SK-D14-2', 'SK-D16-1'] },
    { id: 'C3', name: '货舱冷藏回路 C3', capacityKw: 12, socketIds: ['SK-H08-1', 'SK-H10-1', 'SK-H12-1'] }
  ] as PowerCircuit[],
  sockets: [
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
  ] as ReeferSocket[]
};

const mockBaseQuery: BaseQueryFn = async (arg) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  if (arg === 'voyage' || (typeof arg === 'object' && arg && 'url' in arg && (arg as { url: string }).url === 'voyage')) return { data: voyageData };
  return { error: { status: 404, data: 'Not found' } };
};

export const stowageApi = createApi({
  reducerPath: 'stowageApi',
  baseQuery: mockBaseQuery,
  tagTypes: ['Voyage'],
  endpoints: (builder) => ({
    getVoyage: builder.query<typeof voyageData, void>({ query: () => 'voyage', providesTags: ['Voyage'] })
  })
});

export const { useGetVoyageQuery } = stowageApi;
