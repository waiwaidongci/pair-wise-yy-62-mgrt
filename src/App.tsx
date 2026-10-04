import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  ActionIcon,
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Tooltip
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconAnchor,
  IconBolt,
  IconBoxMultiple,
  IconCheck,
  IconClipboardCheck,
  IconCube,
  IconFileDescription,
  IconHistory,
  IconLayoutBoardSplit,
  IconLock,
  IconMap2,
  IconPlayerPlay,
  IconPlugConnected,
  IconPrinter,
  IconRefresh,
  IconRulerMeasure,
  IconRoute,
  IconShip,
  IconUsers,
  IconWifi,
  IconWifiOff
} from '@tabler/icons-react';
import * as THREE from 'three';
import { useGetVoyageQuery, type Cargo, type CargoType } from './api';
import {
  acceptComment,
  acceptLimit,
  addComment,
  calculateStability,
  canLockPlan,
  canPrintPlan,
  circuitLoads,
  completeReview,
  confirmSocket,
  detectConflicts,
  enqueueOffline,
  isReviewCurrent,
  lockPlan,
  moveCargo,
  planIssues,
  rejectComment,
  releaseSocket,
  selectCargo,
  setOffline,
  setOnline,
  setViewMode,
  store,
  updateCircuitCapacity,
  updateLashing,
  type PowerIssue,
  type RootState
} from './store';

const nav = [
  { path: '/', label: '航次总览', icon: <IconShip size={17} /> },
  { path: '/stowage', label: '配载与货位', icon: <IconLayoutBoardSplit size={17} /> },
  { path: '/departure', label: '开航校核', icon: <IconPlugConnected size={17} /> },
  { path: '/compare', label: '方案对比', icon: <IconHistory size={17} /> },
  { path: '/print', label: '配载图与清单', icon: <IconPrinter size={17} /> }
];

type AnyIssue = ReturnType<typeof detectConflicts>[number] | PowerIssue;

function issueRows(cargo: Parameters<typeof planIssues>[0], circuits: Parameters<typeof planIssues>[1], sockets: Parameters<typeof planIssues>[2]): AnyIssue[] {
  return planIssues(cargo, circuits, sockets);
}

function ReviewBadge({ current, locked }: { current: boolean; locked: boolean }) {
  if (locked) return <Badge color="teal" variant="light">已锁定 · 复核有效</Badge>;
  return current
    ? <Badge color="teal" variant="light" leftSection={<IconClipboardCheck size={13} />}>复核有效，可锁定/打印</Badge>
    : <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={13} />}>结论已失效 · 待复核</Badge>;
}

function StaleReviewAlert({ state }: { state: RootState['stowage'] }) {
  if (state.locked) return null;
  const current = isReviewCurrent(state);
  if (current) return null;
  return <Alert color="orange" icon={<IconAlertTriangle size={17} />} mb="md" title={state.legacyUpgraded ? '旧稿已升级为首版（含冷藏供电回路数据）' : '隔离、稳性与供电结论已失效'} styles={{ message: { fontSize: 12 } }}>
    {state.legacyUpgraded ? '旧配载图缺少冷藏回路数据，已按首版补全插座与回路；此前“插座可用”的结论不再可信。' : '货位或供电回路发生变化，此前的隔离与稳性结论立即失效。'}复核完成前不能锁定或打印配载图。
  </Alert>;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div><Group gap="xs">{actions}</Group></div>;
}

function ThreeHold({ compact = false }: { compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cargo = useSelector((root: RootState) => root.stowage.cargo);
  const activeId = useSelector((root: RootState) => root.stowage.activeCargoId);
  const dispatch = useDispatch();
  const [rotation, setRotation] = useState({ theta: .65, phi: 1.05 });
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce7e3');
    scene.fog = new THREE.Fog('#dce7e3', 38, 88);
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 200);
    scene.add(new THREE.HemisphereLight('#ffffff', '#4b625b', 2.4));
    const light = new THREE.DirectionalLight('#fff5dd', 3.3);
    light.position.set(22, 38, 20);
    light.castShadow = true;
    scene.add(light);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ color: '#4c7c86', roughness: .72 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -.15;
    scene.add(water);
    const hullMat = new THREE.MeshStandardMaterial({ color: '#214c46', roughness: .55, metalness: .18 });
    const deckMat = new THREE.MeshStandardMaterial({ color: '#8b928d', roughness: .9 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(56, 5.5, 18), hullMat);
    hull.position.y = 2.2;
    hull.castShadow = true;
    scene.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(56, .45, 18), deckMat);
    deck.position.y = 5.15;
    deck.receiveShadow = true;
    scene.add(deck);
    for (let x = -24; x <= 24; x += 4) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, 18), new THREE.MeshBasicMaterial({ color: '#b8c8c3' }));
      line.position.set(x, 5.4, 0);
      scene.add(line);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 14), new THREE.MeshStandardMaterial({ color: '#e6e5df' }));
    bridge.position.set(21, 8.7, 0);
    scene.add(bridge);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 4, 16), new THREE.MeshStandardMaterial({ color: '#c26843' }));
    stack.position.set(18, 14.2, 0);
    scene.add(stack);
    const boxes: THREE.Mesh[] = [];
    cargo.filter((item) => item.type === '集装箱').forEach((item) => {
      const geometry = item.dimension.startsWith('20') ? new THREE.BoxGeometry(2.35, 2.3, 2.3) : new THREE.BoxGeometry(4.5, 2.3, 2.3);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: item.color, roughness: .68 }));
      mesh.position.set((item.bay - 20) * 2.2, item.deck === '主甲板' ? 6.7 + item.tier * 2.45 : 2.1 + item.tier * 2.45, (item.row - 4) * 2.5);
      mesh.castShadow = true;
      mesh.userData.id = item.id;
      boxes.push(mesh);
      scene.add(mesh);
    });
    const heavy = cargo.find((item) => item.type === '重大件');
    if (heavy) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(9.5, 2.4, 3), new THREE.MeshStandardMaterial({ color: heavy.color }));
      mesh.position.set((heavy.bay - 20) * 2.2, 6.7, 1.2);
      mesh.userData.id = heavy.id;
      boxes.push(mesh);
      scene.add(mesh);
      const center = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 8.5, 12), new THREE.MeshStandardMaterial({ color: '#e9b54d' }));
      center.position.set((heavy.bay - 20) * 2.2, 7.95, 1.2);
      center.rotation.z = Math.PI / 2;
      scene.add(center);
    }
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let theta = .65;
    let phi = 1.05;
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      theta += (event.clientX - lastX) * .007;
      phi = Math.max(.5, Math.min(1.55, phi + (event.clientY - lastY) * .005));
      lastX = event.clientX;
      lastY = event.clientY;
      setRotation({ theta, phi });
    };
    const onUp = (event: PointerEvent) => {
      dragging = false;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(boxes)[0];
      if (hit?.object.userData.id) dispatch(selectCargo(String(hit.object.userData.id)));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const radius = compact ? 68 : 61;
      camera.position.set(Math.sin(theta) * Math.sin(phi) * radius, Math.cos(phi) * radius + 15, Math.cos(theta) * Math.sin(phi) * radius);
      camera.lookAt(0, 7, 0);
      boxes.forEach((box) => { box.material = box.material as THREE.MeshStandardMaterial; (box.material as THREE.MeshStandardMaterial).emissive = box.userData.id === activeId ? new THREE.Color('#1a5c4b') : new THREE.Color('#000000'); });
      renderer.render(scene, camera);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      renderer.dispose();
    };
  }, [activeId, cargo, compact, dispatch]);
  return <div ref={containerRef} className="three-hold"><canvas ref={canvasRef} /><div className="three-legend"><span><i style={{ background: '#2b7c75' }} />集装箱</span><span><i style={{ background: '#b64f49' }} />重大件</span><span><i style={{ background: '#e9b54d' }} />吊点</span></div><div className="three-hint">拖动旋转 · 点击货箱选择</div><div className="orientation">艏 <span>→</span> 艉</div></div>;
}

function SectionView() {
  const cargo = useSelector((root: RootState) => root.stowage.cargo);
  const dispatch = useDispatch();
  return <div className="section-view"><div className="section-labels"><span>第 3 层</span><span>第 2 层</span><span>第 1 层</span><span>舱底</span></div><div className="section-grid">{Array.from({ length: 9 * 4 }).map((_, index) => { const tier = 4 - Math.floor(index / 9); const row = index % 9; const item = cargo.find((cargoItem) => cargoItem.tier === tier && cargoItem.row === row); return <button key={index} className={item ? 'occupied' : ''} style={item ? { background: item.color } : undefined} onClick={() => item && dispatch(selectCargo(item.id))} title={item ? `${item.id} · ${item.weight}t` : `空货位 R${row} T${tier}`}>{item?.bill.slice(-3)}</button>; })}</div><div className="section-axis">舱内横向剖面 · 鼠标悬停查看重量</div></div>;
}

function Overview() {
  const state = useSelector((root: RootState) => root.stowage);
  const { data } = useGetVoyageQuery();
  const dispatch = useDispatch();
  const stability = calculateStability(state.cargo);
  const issues = issueRows(state.cargo, state.circuits, state.sockets);
  const powerIssues = issues.filter((item) => item.title.includes('冷藏') || item.title.includes('供电'));
  const reviewCurrent = isReviewCurrent(state);
  const lockable = canLockPlan(state);
  const loads = circuitLoads(state.cargo, state.circuits, state.sockets);
  const totalRemaining = loads.reduce((sum, load) => sum + Math.max(0, load.remainingKw), 0);
  const active = state.cargo.find((item) => item.id === state.activeCargoId) ?? state.cargo[0];
  return <div className="page">
    <PageHeading eyebrow={`${data?.id ?? 'V-2609-17'} / 航次审阅`} title="多用途船舶配载校核" description={`${data?.vessel ?? '海岳轮'} · ${data?.route ?? '上海 → 釜山 → 温哥华'} · 计划离港 ${data?.departure ?? '10-02 14:00'}`} actions={<><Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => dispatch(setViewMode(state.viewMode === '3d' ? 'section' : '3d'))}>{state.viewMode === '3d' ? '二维剖面' : '三维视角'}</Button><Tooltip label={!reviewCurrent ? '货位或回路变化后复核结论已失效，复核完成前不能锁定' : undefined} disabled={reviewCurrent}><Button color="teal" leftSection={<IconLock size={16} />} disabled={!lockable || issues.some((item) => item.level === 'high')} onClick={() => dispatch(lockPlan())}>{state.locked ? '方案已锁定' : '锁定配载版本'}</Button></Tooltip></>} />
    <StaleReviewAlert state={state} />
    {issues.length > 0 && <div className="warning-banner"><IconAlertTriangle size={18} /><strong>{issues.length} 项开航校核问题待处理</strong><span>{issues.map((item) => item.title).join('、')}</span></div>}
    <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="sm" mb="md">{[
      ['总货重', `${stability.total.toFixed(1)} t`, '设计上限 3560 t', 'ok'],
      ['稳性裕度', `${stability.stability.toFixed(1)}%`, reviewCurrent ? '已经复核确认' : '货位变化后结论失效，待复核', reviewCurrent ? 'ok' : 'bad'],
      ['纵倾状态', stability.trim, `Lcg ${stability.longitudinal.toFixed(2)} m`, 'ok'],
      ['冷藏供电余量', `${totalRemaining.toFixed(1)} kW`, powerIssues.length ? `${powerIssues.length} 项供电超限/未接入` : '三回路剩余功率合计', powerIssues.length ? 'bad' : 'ok']
    ].map((item) => <Card key={item[0]} padding="md" className="metric-card"><Text size="xs" c="dimmed">{item[0]}</Text><Text fw={800} fz={23} mt={3}>{item[1]}</Text><Text size="xs" c={item[3] === 'bad' ? 'red' : 'teal'}>{item[2]}</Text></Card>)}</SimpleGrid>
    <div className="overview-grid">
      <Card padding={0} className="scene-card"><div className="panel-title"><div><strong>{state.viewMode === '3d' ? '三维货位与航次分布' : '舱内横向剖面'}</strong><Text size="xs" c="dimmed">货箱颜色对应目的港与货类</Text></div><Badge color="teal" variant="light">方案 V{state.planRevision}</Badge></div>{state.viewMode === '3d' ? <ThreeHold /> : <SectionView />}</Card>
      <Stack gap="sm">
        <Card padding="md"><div className="panel-title"><div><strong>开航复核状态</strong><Text size="xs" c="dimmed">隔离 · 稳性 · 冷藏供电</Text></div>{state.locked ? <IconLock size={18} /> : <IconClipboardCheck size={18} />}</div><Stack gap={6} mt="sm"><ReviewBadge current={reviewCurrent} locked={state.locked} /><Text size="xs" c="dimmed">{state.review ? `最近复核 ${state.review.checkedAt} · 基于 V${state.review.revision}${state.review.revision === state.planRevision ? '' : '（已落后于当前 V' + state.planRevision + '）'}` : '本航次尚未完成开航复核'}</Text>{state.review && <Text size="xs">{state.review.note}</Text>}<Button component="a" href="/departure" variant="light" color="teal" size="xs" leftSection={<IconPlugConnected size={14} />}>前往开航校核</Button></Stack></Card>
        <Card padding="md"><div className="panel-title"><div><strong>当前货位</strong><Text size="xs" c="dimmed">{active.id}</Text></div><Badge color={active.hazmat !== '无' ? 'orange' : 'gray'}>{active.hazmat === '无' ? '普通货' : '危险品'}</Badge></div><Stack gap={6} mt="sm"><Text fw={700}>{active.bill} · {active.type}{active.reefer?.reefer && <Badge ml={6} size="xs" color="cyan" leftSection={<IconBolt size={10} />}>冷藏 {active.reefer.kw}kW</Badge>}</Text><Text size="xs" c="dimmed">{active.dimension}</Text><SimpleGrid cols={2} spacing="xs"><div className="mini-stat"><span>重量</span><strong>{active.weight} t</strong></div><div className="mini-stat"><span>卸货港</span><strong>{active.port}</strong></div><div className="mini-stat"><span>货位</span><strong>Bay {active.bay} / Row {active.row} / Tier {active.tier}</strong></div><div className="mini-stat"><span>冷藏插座</span><strong>{active.reefer?.reefer ? (active.reefer.socketId ?? '未接入') : '—'}</strong></div></SimpleGrid></Stack></Card>
        <Card padding="md"><div className="panel-title"><div><strong>重量分布</strong><Text size="xs" c="dimmed">按横向货位统计</Text></div><IconRulerMeasure size={18} /></div><div className="weight-bars">{[2, 4, 6, 8, 10, 12, 14].map((bay) => { const weight = state.cargo.filter((item) => item.bay === bay).reduce((sum, item) => sum + item.weight, 0); return <div key={bay}><span>{weight.toFixed(0)}t</span><i style={{ height: `${Math.max(8, weight / 1.2)}px` }} /><small>B{bay}</small></div>; })}</div></Card>
        <Card padding="md"><div className="panel-title"><div><strong>角色限制条件</strong><Text size="xs" c="dimmed">{state.comments.filter((item) => item.status === '待确认').length} 项待确认</Text></div><IconUsers size={18} /></div>{state.comments.slice(0, 3).map((comment) => <div className="limit-row" key={comment.id}><div><Text size="xs" fw={700}>{comment.author} · {comment.role}</Text><Text size="xs" c="dimmed">{comment.content}</Text></div><Badge size="xs" color={comment.status === '待确认' ? 'orange' : 'teal'}>{comment.status}</Badge></div>)}</Card>
      </Stack>
    </div>
  </div>;
}

function Stowage() {
  const state = useSelector((root: RootState) => root.stowage);
  const dispatch = useDispatch();
  const active = state.cargo.find((item) => item.id === state.activeCargoId) ?? state.cargo[0];
  const conflicts = issueRows(state.cargo, state.circuits, state.sockets);
  const blockers = conflicts.filter((item) => item.level === 'high');
  const stability = calculateStability(state.cargo);
  const [bay, setBay] = useState(active.bay);
  const [row, setRow] = useState(active.row);
  const [tier, setTier] = useState(active.tier);
  const [dragId, setDragId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  useEffect(() => { setBay(active.bay); setRow(active.row); setTier(active.tier); }, [active.bay, active.row, active.tier]);
  const slots = useMemo(() => Array.from({ length: 28 }).map((_, index) => ({ id: `slot-${index}`, bay: 4 + Math.floor(index / 4), row: index % 4, tier: 0, label: `B${4 + Math.floor(index / 4)} R${index % 4}` })), []);
  return <div className="page">
    <PageHeading eyebrow={`配载工作区 / 方案 V${state.planRevision}`} title="货位安排与冲突校核" description="拖动货箱排序，或输入目标货位精确调整；货位变化后隔离与稳性结论立即失效，需重新复核。" actions={<Badge size="lg" color={blockers.length ? 'red' : conflicts.length ? 'orange' : 'teal'} leftSection={<IconCheck size={14} />}>{blockers.length ? `${blockers.length} 项阻断` : conflicts.length ? `${conflicts.length} 项预警` : '校验通过'}</Badge>} />
    <StaleReviewAlert state={state} />
    <div className="stowage-grid">
      <Card padding={0} className="cargo-list-panel"><div className="panel-title"><div><strong>货物清单</strong><Text size="xs" c="dimmed">{state.cargo.length} 票 · 可拖拽</Text></div><TextInput size="xs" placeholder="搜索提单号" /></div><ScrollArea h={600}><div className="cargo-list">{state.cargo.map((item) => <button draggable onDragStart={() => setDragId(item.id)} key={item.id} className={state.activeCargoId === item.id ? 'active' : ''} onClick={() => dispatch(selectCargo(item.id))}><i style={{ background: item.color }} /><div><strong>{item.bill}{item.reefer?.reefer && <IconBolt size={10} className="reefer-mark" />}</strong><span>{item.type} · {item.weight}t · {item.port}{item.reefer?.reefer ? ` · 冷藏 ${item.reefer.kw}kW` : ''}</span></div><Badge size="xs" color={item.hazmat === '无' ? (item.reefer?.reefer ? 'cyan' : 'gray') : 'orange'}>{item.hazmat === '无' ? (item.reefer?.reefer ? '冷' : `B${item.bay}`) : 'DG'}</Badge></button>)}</div></ScrollArea></Card>
      <Card padding={0} className="deck-panel"><div className="panel-title"><div><strong>主甲板货位图</strong><Text size="xs" c="dimmed">将货物拖入槽位，或点击槽位选择</Text></div><Group gap="xs"><Badge color="teal">稳性 {stability.stability.toFixed(1)}%</Badge><Badge color="gray">{stability.trim}</Badge></Group></div><div className="deck-layout"><div className="bridge-shape">驾驶台</div><div className="slot-grid">{slots.map((slot) => { const occupied = state.cargo.find((item) => item.deck === '主甲板' && item.bay === slot.bay && item.row === slot.row); return <button key={slot.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragId) dispatch(moveCargo({ id: dragId, bay: slot.bay, row: slot.row, tier: occupied?.tier ?? 1 })); setDragId(null); }} className={occupied ? 'occupied' : ''} style={occupied ? { background: occupied.color } : undefined} onClick={() => { if (occupied) { dispatch(selectCargo(occupied.id)); setRow(slot.row); setBay(slot.bay); } }}><small>{slot.label}</small>{occupied && <strong>{occupied.bill.slice(-3)}<span>{occupied.weight}t</span></strong>}</button>; })}</div><div className="deck-axis">左舷 ← 横向 Row → 右舷</div></div></Card>
      <Stack gap="sm">
        <Card padding="md"><div className="panel-title"><div><strong>精确调整</strong><Text size="xs" c="dimmed">{active.id}</Text></div><IconCube size={18} /></div><Stack gap="sm" mt="md"><NumberInput label="Bay 纵向货位" min={1} max={20} value={bay} onChange={(value) => setBay(Number(value))} /><NumberInput label="Row 横向货位" min={0} max={8} value={row} onChange={(value) => setRow(Number(value))} /><NumberInput label="Tier 堆码层" min={0} max={4} value={tier} onChange={(value) => setTier(Number(value))} /><Button color="teal" onClick={() => dispatch(moveCargo({ id: active.id, bay, row, tier }))}>应用货位调整</Button><Divider /><Select label="绑扎状态" data={['已绑扎', '待绑扎', '需复核']} value={active.lashing} onChange={(value) => value && dispatch(updateLashing({ id: active.id, lashing: value as Cargo['lashing'] }))} /></Stack></Card>
        <Card padding="md" className={conflicts.length ? 'conflict-card' : ''}><div className="panel-title"><div><strong>实时校核</strong><Text size="xs" c="dimmed">隔离、稳性、堆码与冷藏供电</Text></div><IconAlertTriangle size={18} /></div>{conflicts.map((item) => <button className="conflict-row" key={item.id} onClick={() => dispatch(selectCargo(item.cargoId))}><Badge size="xs" color={item.level === 'high' ? 'red' : 'orange'}>{item.level === 'high' ? '阻断' : '预警'}</Badge><div><strong>{item.title}</strong><span>{item.detail}</span>{'alternatives' in item && item.alternatives.length > 0 && <span className="alt-line">替代货位：{item.alternatives.join('；')}</span>}</div></button>)}{!conflicts.length && <Text size="sm" c="teal" mt="md">当前方案未发现冲突。</Text>}</Card>
      </Stack>
    </div>
    <Card padding="md" mt="md"><div className="panel-title"><div><strong>角色条件与审批</strong><Text size="xs" c="dimmed">船长、码头和货主代表可对方案提出限制</Text></div><IconUsers size={18} /></div><div className="comments-grid">{state.comments.map((item) => <div className="comment-card" key={item.id}><Group justify="space-between"><Badge size="xs">{item.role}</Badge><Text size="xs" c="dimmed">{item.author}</Text></Group><Text size="sm" mt="xs">{item.content}</Text><Group gap="xs" mt="sm"><Button size="compact-xs" color="teal" disabled={item.status !== '待确认'} onClick={() => dispatch(acceptComment(item.id))}>接受</Button><Button size="compact-xs" variant="default" disabled={item.status !== '待确认'} onClick={() => dispatch(rejectComment(item.id))}>退回</Button></Group></div>)}</div><Group mt="md" align="flex-start"><Textarea flex={1} minRows={2} placeholder="输入新的限制条件或调整意见" value={comment} onChange={(event) => setComment(event.currentTarget.value)} /><Button color="teal" onClick={() => { if (comment.trim()) { dispatch(addComment({ cargoId: active.id, author: '本次负责人', role: '船长', content: comment })); setComment(''); } }}>提交条件</Button></Group></Card>
  </div>;
}

function DepartureCheck() {
  const state = useSelector((root: RootState) => root.stowage);
  const dispatch = useDispatch();
  const loads = circuitLoads(state.cargo, state.circuits, state.sockets);
  const issues = planIssues(state.cargo, state.circuits, state.sockets);
  const blockers = issues.filter((item) => item.level === 'high');
  const reviewCurrent = isReviewCurrent(state);
  const lockable = canLockPlan(state);
  const reefers = state.cargo.filter((item) => item.reefer?.reefer);
  const unassigned = reefers.filter((item) => !item.reefer!.socketId);
  const occupiedBySocket = new Map(reefers.filter((item) => item.reefer!.socketId).map((item) => [item.reefer!.socketId!, item]));

  const [cargoId, setCargoId] = useState(unassigned[0]?.id ?? reefers[0].id);
  const [socketId, setSocketId] = useState(state.sockets.find((socket) => !occupiedBySocket.has(socket.id))?.id ?? state.sockets[0].id);
  const [officer, setOfficer] = useState('值班员 王艇');
  const [reviewNote, setReviewNote] = useState('隔离、稳性与冷藏供电已逐项核对，符合开航条件。');
  const selectedSocket = state.sockets.find((socket) => socket.id === socketId);
  const selectedLoad = loads.find((load) => load.circuit.id === selectedSocket?.circuitId);
  const selectedCargo = state.cargo.find((item) => item.id === cargoId);

  const socketOptions = state.sockets.map((socket) => {
    const holder = occupiedBySocket.get(socket.id);
    const load = loads.find((entry) => entry.circuit.id === socket.circuitId)!;
    return { value: socket.id, label: `${socket.id} · ${socket.deck} B${socket.bay} · 余 ${Math.max(0, load.remainingKw).toFixed(1)}kW${holder ? `（占用 ${holder.id}）` : ''}`, disabled: !!holder && holder.id !== cargoId };
  });

  return <div className="page">
    <PageHeading eyebrow="DEPARTURE CHECK / 开航校核" title="冷藏供电 · 隔离稳性复核" description="冷藏箱、货位与供电回路联动校核：剩余功率按已分配箱数逐箱扣减；超限给出替代货位；复核失效期间禁止锁定与打印。"
      actions={<Group gap="xs">
        <Button variant={state.online ? 'light' : 'filled'} color={state.online ? 'teal' : 'orange'} size="sm" leftSection={state.online ? <IconWifi size={15} /> : <IconWifiOff size={15} />} onClick={() => dispatch(state.online ? setOffline() : setOnline())}>{state.online ? '在线 · 模拟断网' : '离线 · 模拟回连'}</Button>
        <Tooltip label={!reviewCurrent ? '复核结论失效或未完成，不能锁定' : undefined} disabled={reviewCurrent}><Button color="teal" leftSection={<IconLock size={16} />} disabled={!lockable || blockers.length > 0} onClick={() => dispatch(lockPlan())}>{state.locked ? '方案已锁定' : '锁定配载版本'}</Button></Tooltip>
        <Tooltip label={!canPrintPlan(state) ? '复核完成前不能打印配载图' : undefined} disabled={canPrintPlan(state)}><Button variant="default" color="teal" leftSection={<IconPrinter size={16} />} disabled={!canPrintPlan(state)} onClick={() => window.print()}>打印</Button></Tooltip>
      </Group>} />

    <StaleReviewAlert state={state} />
    {state.legacyUpgraded && <Alert color="cyan" icon={<IconPlugConnected size={17} />} mb="md" title="首版供电数据已生效" styles={{ message: { fontSize: 12 } }}>旧稿缺少回路数据时已升级成首版：共 {state.circuits.length} 条回路、{state.sockets.length} 个冷藏插座，请按本版重新完成开航校核。</Alert>}

    <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md" mb="md">
      {loads.map((load) => {
        const ratio = Math.min(110, Math.round((load.usedKw / load.circuit.capacityKw) * 100));
        return <Card key={load.circuit.id} padding="md" className={`circuit-card${load.overloaded ? ' overloaded' : ''}`}>
          <Group justify="space-between"><strong>{load.circuit.name}</strong>{load.overloaded ? <Badge color="red" leftSection={<IconAlertTriangle size={12} />}>超限 {((load.usedKw - load.circuit.capacityKw)).toFixed(1)}kW</Badge> : <Badge color="teal">正常</Badge>}</Group>
          <div className="circuit-meter"><i style={{ width: `${Math.min(100, ratio)}%`, background: load.overloaded ? '#c0492f' : ratio > 85 ? '#c98b2a' : '#2f8f7d' }} /><span>{ratio}%</span></div>
          <Group justify="space-between" mt={6}><Text size="xs" c="dimmed">已用 {load.usedKw.toFixed(1)} / 额定 {load.circuit.capacityKw}kW</Text><Text size="xs" c={load.overloaded ? 'red' : 'teal'} fw={800}>剩余 {load.remainingKw.toFixed(1)}kW</Text></Group>
          <div className="socket-row">
            {load.circuit.socketIds.map((id) => { const holder = occupiedBySocket.get(id); return <Tooltip key={id} label={holder ? `${id} · ${holder.id}（${holder.reefer!.kw}kW）` : `${id} · 空闲`}><span className={holder ? 'busy' : 'free'}>{id.split('-').slice(1).join('-')}</span></Tooltip>; })}
          </div>
          <Group gap={6} mt={8} align="center"><Text size="xs" c="dimmed">回路容量调整</Text><NumberInput size="xs" w={90} min={0} value={load.circuit.capacityKw} onChange={(value) => dispatch(updateCircuitCapacity({ id: load.circuit.id, capacityKw: Math.max(0, Number(value) || 0) }))} /><Text size="xs">kW</Text></Group>
        </Card>;
      })}
    </SimpleGrid>

    <div className="departure-grid">
      <Stack gap="md">
        <Card padding="md">
          <div className="panel-title px0"><div><strong>插座确认（先确认者占用）</strong><Text size="xs" c="dimmed">两名值班员同时提交同一插座时，按确认顺序仲裁</Text></div><IconPlugConnected size={18} /></div>
          <Stack gap="sm" mt="md">
            <Select label="冷藏箱" data={reefers.map((item) => ({ value: item.id, label: `${item.id} · ${item.reefer!.kw}kW${item.reefer!.socketId ? ` · 现占 ${item.reefer!.socketId}` : ' · 未接入'}` }))} value={cargoId} onChange={(value) => value && setCargoId(value)} />
            <Select label="目标插座" data={socketOptions} value={socketId} onChange={(value) => value && setSocketId(value)} />
            <Select label="提交值班员" data={['值班员 王艇', '值班员 李岸']} value={officer} onChange={(value) => value && setOfficer(value)} />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">{selectedSocket ? `${selectedSocket.deck} B${selectedSocket.bay} · ${selectedLoad?.circuit.name}` : ''}，剩余 {selectedLoad ? Math.max(0, selectedLoad.remainingKw).toFixed(1) : '—'}kW；本箱需求 {selectedCargo?.reefer?.kw ?? 0}kW</Text>
              <Badge color={selectedLoad && selectedLoad.remainingKw >= (selectedCargo?.reefer?.kw ?? 0) ? 'teal' : 'red'}>{selectedLoad && selectedLoad.remainingKw >= (selectedCargo?.reefer?.kw ?? 0) ? '功率可行' : '接入即超限'}</Badge>
            </Group>
            <Group gap="xs">
              <Button color="teal" leftSection={<IconCheck size={15} />} disabled={state.locked} onClick={() => dispatch(confirmSocket({ cargoId, socketId, officer }))}>确认占用</Button>
              <Button variant="light" color="red" disabled={state.locked || !selectedCargo?.reefer?.socketId} onClick={() => dispatch(releaseSocket(cargoId))}>释放本箱插座</Button>
            </Group>
          </Stack>
          {state.lastResult && <Alert mt="md" color={state.lastResult.outcome === 'confirmed' ? 'teal' : state.lastResult.outcome === 'duplicate' ? 'gray' : 'red'} icon={state.lastResult.outcome === 'confirmed' ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />} title={state.lastResult.outcome === 'confirmed' ? '确认成功' : state.lastResult.outcome === 'conflict' ? '插座冲突' : state.lastResult.outcome === 'overload' ? '回路超限' : '重复记录'} styles={{ message: { fontSize: 12 } }}>
            <Text size="xs">{state.lastResult.detail}</Text>
            {state.lastResult.alternatives && state.lastResult.alternatives.length > 0 && <Text size="xs" mt={6} c="teal">替代货位：{state.lastResult.alternatives.join('；')}</Text>}
          </Alert>}
        </Card>

        <Card padding="md">
          <div className="panel-title px0"><div><strong>并发与断网演练</strong><Text size="xs" c="dimmed">同一插座同时提交、断网缓存与回连合并去重</Text></div>{state.online ? <Badge color="teal" leftSection={<IconWifi size={13} />}>在线</Badge> : <Badge color="orange" leftSection={<IconWifiOff size={13} />}>离线缓存中</Badge>}</div>
          <Stack gap="sm" mt="md">
            <div className="drill-box">
              <Text size="xs" fw={700}>两人同时提交同一插座</Text>
              <Text size="xs" c="dimmed" mt={4}>以 {cargoId} 与另一冷藏箱抢同一插座，两笔按确认顺序连续处理：先确认者保持占用，后到者看到冲突。</Text>
              <Group gap="xs" mt={8}>
                <Button size="xs" variant="light" color="teal" disabled={state.locked} onClick={() => { const pool = unassigned.length ? unassigned : reefers; const rival = (pool.find((item) => item.id !== cargoId) ?? reefers.find((item) => item.id !== cargoId))!.id; dispatch(confirmSocket({ cargoId, socketId, officer: '值班员 王艇' })); dispatch(confirmSocket({ cargoId: rival, socketId, officer: '值班员 李岸' })); }}>同时提交（当前箱先确认）</Button>
                <Button size="xs" variant="default" disabled={state.locked} onClick={() => { const pool = unassigned.length ? unassigned : reefers; const rival = (pool.find((item) => item.id !== cargoId) ?? reefers.find((item) => item.id !== cargoId))!.id; dispatch(confirmSocket({ cargoId: rival, socketId, officer: '值班员 李岸' })); dispatch(confirmSocket({ cargoId, socketId, officer: '值班员 王艇' })); }}>同时提交（对方先确认）</Button>
              </Group>
            </div>
            <div className="drill-box">
              <Text size="xs" fw={700}>断网记录（回连后按插座合并）</Text>
              <Text size="xs" c="dimmed" mt={4}>离线时的确认先缓存，不扣减功率；回连后逐插座只接受先确认的一笔，重复上传不重复扣减。</Text>
              <Group gap="xs" mt={8}>
                <Button size="xs" variant="light" color={state.online ? 'gray' : 'orange'} disabled={state.online || state.locked} onClick={() => dispatch(enqueueOffline({ cargoId, socketId, officer }))}>缓存当前确认</Button>
                <Button size="xs" variant="default" disabled={state.online || !state.offlineQueue.length} onClick={() => { const last = state.offlineQueue[state.offlineQueue.length - 1]; dispatch(enqueueOffline({ cargoId: last.cargoId, socketId: last.socketId, officer: last.officer, clientId: last.clientId, recordedAt: last.recordedAt })); }}>同一记录重复上传</Button>
                <Button size="xs" color="teal" disabled={state.online || state.locked} onClick={() => dispatch(setOnline())}>立即回连合并</Button>
              </Group>
              {state.offlineQueue.length > 0 && <div className="offline-queue">{state.offlineQueue.map((record) => <span key={record.clientId}>{record.socketId} ← {record.cargoId} · {record.officer} · {record.recordedAt}</span>)}</div>}
            </div>
          </Stack>
        </Card>
      </Stack>

      <Stack gap="md">
        <Card padding="md" className={blockers.length ? 'conflict-card' : ''}>
          <div className="panel-title px0"><div><strong>开航校核问题</strong><Text size="xs" c="dimmed">剩余功率按已分配箱数扣减，超限给出替代货位</Text></div><Badge color={blockers.length ? 'red' : 'teal'}>{blockers.length ? `${blockers.length} 项阻断` : '无阻断'}</Badge></div>
          {issues.length === 0 && <Text size="sm" c="teal" mt="md">隔离、稳性与冷藏供电均满足开航条件。</Text>}
          <Stack gap="sm" mt="md">{issues.map((issue) => <div key={issue.id} className="issue-row"><Group justify="space-between"><Badge size="xs" color={issue.level === 'high' ? 'red' : 'orange'}>{issue.level === 'high' ? '阻断' : '预警'}</Badge><Text size="xs" c="dimmed">{issue.cargoId}</Text></Group><strong>{issue.title}</strong><span>{issue.detail}</span>{'alternatives' in issue && issue.alternatives.length > 0 && <span className="alt-line">替代货位：{issue.alternatives.join('；')}</span>}</div>)}</Stack>
        </Card>

        <Card padding="md">
          <div className="panel-title px0"><div><strong>开航复核</strong><Text size="xs" c="dimmed">货位或回路变化后结论立即失效，须重新复核</Text></div><ReviewBadge current={reviewCurrent} locked={state.locked} /></div>
          <Stack gap="sm" mt="md">
            <Text size="xs" c="dimmed">复核版本：V{state.review?.revision ?? '—'}{state.review && state.review.revision !== state.planRevision ? `（当前 V${state.planRevision}，已失效）` : ''} · {state.review?.checkedAt ?? '尚未复核'}</Text>
            <Textarea minRows={2} value={reviewNote} onChange={(event) => setReviewNote(event.currentTarget.value)} placeholder="复核结论备注" />
            <Button color="teal" leftSection={<IconClipboardCheck size={15} />} disabled={state.locked} onClick={() => dispatch(completeReview(reviewNote))}>{blockers.length ? '重新复核（存在阻断）' : '完成开航复核'}</Button>
            {state.review && !state.review.passed && <Alert color="red" icon={<IconAlertTriangle size={15} />} styles={{ message: { fontSize: 12 } }}>{state.review.note}</Alert>}
            <Text size="xs" c="dimmed">复核通过前，「锁定配载版本」与「打印配载图」保持禁用；任何货位移动或回路容量调整都会让结论立即失效。</Text>
          </Stack>
        </Card>

        <Card padding="md">
          <div className="panel-title px0"><div><strong>插座确认记录</strong><Text size="xs" c="dimmed">先确认者占用，后到冲突可溯源</Text></div><IconHistory size={18} /></div>
          <ScrollArea h={210} mt="sm">{state.socketLog.length === 0 && <Text size="xs" c="dimmed">暂无确认记录。</Text>}{state.socketLog.map((event) => <div key={event.id} className={`socket-log ${event.outcome}`}><Group justify="space-between"><Badge size="xs" color={event.outcome === 'confirmed' ? 'teal' : event.outcome === 'duplicate' ? 'gray' : 'red'}>{event.outcome === 'confirmed' ? '已占用' : event.outcome === 'conflict' ? '冲突' : event.outcome === 'overload' ? '超限' : '重复'}</Badge><Text size="xs" c="dimmed">{event.at} · {event.officer}</Text></Group><span>{event.cargoId} → {event.socketId}</span><small>{event.detail}</small></div>)}</ScrollArea>
        </Card>
      </Stack>
    </div>
  </div>;
}

function Compare() {
  const state = useSelector((root: RootState) => root.stowage);
  const stability = calculateStability(state.cargo);
  const changed = state.cargo.filter((item) => item.id === 'BL-88247' || item.id === 'BL-88219' || item.id === 'BL-88240');
  const [acceptOpen, setAcceptOpen] = useState(false);
  const dispatch = useDispatch();
  const reviewCurrent = isReviewCurrent(state);
  return <div className="page">
    <PageHeading eyebrow="PLAN BASELINE / V4 → V5" title="配载方案对比" description="按货位、重量分布和受限条件比较两个版本，并逐项决定是否接受。" actions={<Button color="teal" leftSection={<IconCheck size={16} />} onClick={() => setAcceptOpen(true)}>形成审阅结论</Button>} />
    {!reviewCurrent && !state.locked && <div className="warning-banner"><IconAlertTriangle size={18} /><strong>复核结论已失效</strong><span>货位或回路发生变化，需在开航校核页重新复核，完成前不能锁定或打印。</span></div>}
    <div className="compare-summary"><div><span>当前版本</span><strong>V{state.planRevision}</strong><small>总重 {stability.total.toFixed(1)}t</small></div><span className="compare-arrow">→</span><div><span>被比较版本</span><strong>V4</strong><small>总重 {(stability.total + 5.2).toFixed(1)}t</small></div><Badge color="teal" variant="light">3 处货位变化</Badge></div>
    <div className="compare-grid"><Card padding={0}><div className="panel-title"><div><strong>V4 基线</strong><Text size="xs" c="dimmed">批准于 09-28 16:20</Text></div></div><div className="mini-deck old-deck">{Array.from({ length: 28 }).map((_, index) => <div key={index} className={index === 6 || index === 11 || index === 17 ? 'changed' : ''}>{index === 6 ? '219' : index === 11 ? '240' : index === 17 ? '247' : ''}</div>)}</div></Card><Card padding={0}><div className="panel-title"><div><strong>V5 候选</strong><Text size="xs" c="dimmed">当前编辑 · {state.draftSavedAt}</Text></div></div><div className="mini-deck new-deck">{Array.from({ length: 28 }).map((_, index) => <div key={index} className={index === 6 || index === 11 || index === 17 ? 'changed' : ''}>{index === 6 ? '219' : index === 11 ? '240' : index === 17 ? '247' : ''}</div>)}</div></Card></div>
    <Card padding="md" mt="md"><div className="panel-title"><div><strong>参数差异</strong><Text size="xs" c="dimmed">系统通过检查的差异可直接接受</Text></div><Badge>{changed.length} 项</Badge></div><Table verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>货物</Table.Th><Table.Th>字段</Table.Th><Table.Th>V4</Table.Th><Table.Th>V5</Table.Th><Table.Th>说明</Table.Th><Table.Th>决定</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{[
      ['BL-88247', '货位', 'Bay 14 / Row 1', 'Bay 15 / Row 0', '扩大重大件绑扎操作空间'],
      ['BL-88219', '绑扎', '待绑扎', '需复核', '危险品隔离边界调整'],
      ['BL-88240', 'Tier', 'Tier 1', 'Tier 2', '降低舱内底层局部载荷']
    ].map((row) => <Table.Tr key={row[0]}><Table.Td>{row[0]}</Table.Td><Table.Td>{row[1]}</Table.Td><Table.Td><Text c="red" td="line-through">{row[2]}</Text></Table.Td><Table.Td><Text c="teal" fw={700}>{row[3]}</Text></Table.Td><Table.Td><Text size="xs">{row[4]}</Text></Table.Td><Table.Td><Checkbox label="接受" defaultChecked /></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card>
    <Modal opened={acceptOpen} onClose={() => setAcceptOpen(false)} title="形成配载审阅结论" centered><Stack><Text size="sm" c="dimmed">接受后生成新的只读版本并保留船长、码头和货主意见。锁定前仍可退回修改；货位或回路变化后须重新复核。</Text>{['重大件绑扎后由甲板部复核', '危险品隔离线在配载图中明确标注', '釜山卸货顺序不得改变'].map((limit) => <Checkbox key={limit} label={limit} checked={state.acceptedLimits.includes(limit)} onChange={() => dispatch(acceptLimit(limit))} />)}{!reviewCurrent && <Text size="xs" c="red">当前隔离/稳性/供电结论已失效，请先在「开航校核」页完成复核。</Text>}<Button color="teal" disabled={state.acceptedLimits.length < 3 || !canLockPlan(state)} onClick={() => { dispatch(lockPlan()); setAcceptOpen(false); }}>{state.locked ? '方案已锁定' : `接受并锁定 V${state.planRevision}`}</Button></Stack></Modal>
  </div>;
}

function PrintPlan() {
  const { data } = useGetVoyageQuery();
  const state = useSelector((root: RootState) => root.stowage);
  const stability = calculateStability(state.cargo);
  const dispatch = useDispatch();
  const printable = canPrintPlan(state);
  const loads = circuitLoads(state.cargo, state.circuits, state.sockets);
  const reefers = state.cargo.filter((item) => item.reefer?.reefer);
  return <div className="page print-page">
    <PageHeading eyebrow="STOWAGE PLAN / PRINT" title="配载图与卸货清单" description="面向船长、码头和理货人员打印，包含重量分布、危险品标记与冷藏供电校核。" actions={<><Button variant="default" leftSection={<IconPlayerPlay size={16} />} onClick={() => dispatch(setViewMode(state.viewMode === '3d' ? 'section' : '3d'))}>预览剖面</Button><Tooltip label={!printable ? '货位或回路变化后复核结论失效，复核完成前不能打印' : undefined} disabled={printable}><Button color="teal" leftSection={<IconPrinter size={16} />} disabled={!printable} onClick={() => window.print()}>打印配载包</Button></Tooltip></>} />
    {!printable && <Alert color="orange" icon={<IconAlertTriangle size={17} />} mb="md" title="复核结论失效，禁止打印" styles={{ message: { fontSize: 12 } }}>货位或供电回路发生变化后，隔离与稳性结论立即失效；请在「开航校核」页完成复核，再打印本配载图。</Alert>}
    <Card padding="xl" className="print-sheet">
      <div className="print-header"><div><Text size="xs" c="dimmed">VESSEL STOWAGE PLAN</Text><h1>{data?.vessel ?? '海岳轮'} · {data?.id ?? 'V-2609-17'}</h1><p>{data?.route}</p></div><div className={`print-stamp${printable ? '' : ' invalid'}`}>方案 V{state.planRevision}<br />{state.locked ? '已锁定' : printable ? '复核有效' : '复核失效·禁印'}</div></div>
      <div className="print-kpis"><div><span>总货重</span><strong>{stability.total.toFixed(1)} t</strong></div><div><span>稳性裕度</span><strong>{stability.stability.toFixed(1)}%</strong></div><div><span>纵倾</span><strong>{stability.trim}</strong></div><div><span>主甲板载荷</span><strong>{stability.deckLoad.toFixed(1)} t</strong></div></div>
      <h3>主甲板配载图</h3>
      <div className="print-deck">{Array.from({ length: 28 }).map((_, index) => { const row = index % 4; const bay = 4 + Math.floor(index / 4); const item = state.cargo.find((cargo) => cargo.deck === '主甲板' && cargo.bay === bay && cargo.row === row); return <div key={index} className={item ? 'filled' : ''} style={item ? { borderTopColor: item.color } : undefined}><span>{item ? item.bill.slice(-3) : ''}{item?.reefer?.reefer ? ' ❄' : ''}</span><small>{item ? `${item.weight}t` : `B${bay}/R${row}`}</small>{item?.hazmat !== '无' && item && <b>DG</b>}</div>; })}</div>
      <h3>冷藏箱供电开航校核（剩余功率按已分配箱数扣减）</h3>
      <Table striped className="print-reefer"><Table.Thead><Table.Tr><Table.Th>提单号</Table.Th><Table.Th>功率</Table.Th><Table.Th>插座</Table.Th><Table.Th>供电回路</Table.Th><Table.Th>货位</Table.Th><Table.Th>状态</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{reefers.map((item) => { const socket = state.sockets.find((entry) => entry.id === item.reefer!.socketId); const circuit = state.circuits.find((entry) => entry.id === socket?.circuitId); return <Table.Tr key={item.id}><Table.Td fw={700}>{item.bill}</Table.Td><Table.Td>{item.reefer!.kw} kW</Table.Td><Table.Td>{item.reefer!.socketId ?? '未接入'}</Table.Td><Table.Td>{circuit ? `${circuit.name}（余 ${loads.find((load) => load.circuit.id === circuit.id)?.remainingKw.toFixed(1)}kW）` : '—'}</Table.Td><Table.Td>B{item.bay}/R{item.row}/T{item.tier}</Table.Td><Table.Td><Badge size="xs" color={socket ? 'teal' : 'red'}>{socket ? '已分配' : '阻断·未供电'}</Badge></Table.Td></Table.Tr>; })}</Table.Tbody></Table>
      <h3>卸货顺序与绑扎清单</h3>
      <Table striped><Table.Thead><Table.Tr><Table.Th>顺序</Table.Th><Table.Th>提单号</Table.Th><Table.Th>货位</Table.Th><Table.Th>货类</Table.Th><Table.Th>重量</Table.Th><Table.Th>卸货港</Table.Th><Table.Th>危险品 / 绑扎</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{[...state.cargo].sort((a, b) => (a.port === '釜山' ? -1 : 1) - (b.port === '釜山' ? -1 : 1)).map((item, index) => <Table.Tr key={item.id}><Table.Td>{index + 1}</Table.Td><Table.Td fw={700}>{item.bill}</Table.Td><Table.Td>B{item.bay}/R{item.row}/T{item.tier}</Table.Td><Table.Td>{item.type}</Table.Td><Table.Td>{item.weight} t</Table.Td><Table.Td>{item.port}</Table.Td><Table.Td><Badge size="xs" color={item.hazmat !== '无' ? 'orange' : 'gray'}>{item.hazmat}</Badge> <Text span size="xs">{item.lashing}</Text></Table.Td></Table.Tr>)}</Table.Tbody></Table>
      <div className="print-signatures"><div>配载负责人：____________</div><div>船长确认：____________</div><div>码头代表：____________</div><div>日期：2026-09-29</div></div>
    </Card>
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const state = useSelector((root: RootState) => root.stowage);
  const stability = calculateStability(state.cargo);
  const reviewCurrent = isReviewCurrent(state);
  return <AppShell header={{ height: 62 }} navbar={{ width: 224, breakpoint: 'sm' }} padding={0}>
    <AppShellHeader className="app-header"><Group h="100%" px="md" justify="space-between"><Group gap="sm"><ThemeIcon color="teal" variant="light"><IconShip size={19} /></ThemeIcon><div className="brand-copy"><strong>船舶配载校核台</strong><span>Stowage & Voyage Review</span></div></Group><Group gap="sm" visibleFrom="sm"><Badge variant="light" color="teal">海岳轮</Badge><Text size="xs" c="dimmed">V-2609-17 · 方案 V{state.planRevision}</Text>{state.online ? <Badge color="teal" variant="dot">在线</Badge> : <Badge color="orange" variant="dot">离线缓存</Badge>}<Badge color={state.locked ? 'teal' : reviewCurrent ? 'green' : 'orange'}>{state.locked ? '已锁定' : reviewCurrent ? '复核有效' : '待复核'}</Badge></Group><ActionIcon variant="subtle" color="gray"><IconAnchor size={18} /></ActionIcon></Group></AppShellHeader>
    <AppShellNavbar p="xs" className="app-nav"><div className="voyage-card"><Text size="xs" c="dimmed">当前航次</Text><Text fw={800}>上海 → 温哥华</Text><Text size="xs" c="dimmed">经停釜山 · 10-02 离港</Text><Progress value={stability.stability} color={reviewCurrent ? 'teal' : 'orange'} size="sm" mt="sm" /><Text size="xs" mt={4}>{reviewCurrent ? '隔离/稳性/供电复核有效' : '结论已失效 · 待开航复核'}</Text></div>{nav.map((item) => <NavLink end={item.path === '/'} key={item.path} to={item.path}>{item.icon}<span>{item.label}</span></NavLink>)}<div className="nav-foot"><IconRoute size={16} /><Text size="xs">基线：方案 V4<br />草稿：{state.draftSavedAt} 自动保存</Text></div></AppShellNavbar>
    <AppShellMain>{children}</AppShellMain>
  </AppShell>;
}

export default function App() {
  return <BrowserRouter><Shell><Routes><Route path="/" element={<Overview />} /><Route path="/stowage" element={<Stowage />} /><Route path="/departure" element={<DepartureCheck />} /><Route path="/compare" element={<Compare />} /><Route path="/print" element={<PrintPlan />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Shell></BrowserRouter>;
}
