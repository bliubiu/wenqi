'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { GalaxyScene, HoverInfo } from '@/presentation/scene/GalaxyScene';
import { Canvas2DEngine } from '@/presentation/scene/Canvas2DEngine';
import { TextFallbackEngine } from '@/presentation/scene/TextFallbackEngine';
import { detectWebGLSupport } from '@/presentation/scene/RendererFactory';
import { projectGeoX, projectGeoZ, buildGeoOutlineVertices } from '@/presentation/scene/geoLayout';
import { CompositionRoot } from '@/di/composition-root';
import { Search } from './Search';
import { DimensionSlider } from './DimensionSlider';
import { Share, type CardContent } from './Share';
import { StarList } from './StarList';
import { DailyPoemCard } from './DailyPoemCard';
import { AccessibilityPanel } from './AccessibilityPanel';
import { InfoPanel } from './InfoPanel';
import { PoetDetailPanel } from './PoetDetailPanel';
import { ComparePanel } from './ComparePanel';
import { AxisLegend } from './AxisLegend';
import { DynastyLegend } from './DynastyLegend';
import { LoadingOverlay } from './LoadingOverlay';
import { WelcomeGuide } from './WelcomeGuide';
import { RendererBanner } from './RendererBanner';
import { MobileNav } from './MobileNav';
import { TourOverlay } from './TourOverlay';
import { Timeline } from './Timeline';
import { TimeTravelUseCase, type TimeTravelState } from '@/application/usecases/TimeTravelUseCase';
import { DataLoader } from '@/infrastructure/data/DataLoader';
import type { PoetDTO, ScoreDTO } from '@/application/dto/GalaxyDTO';
import { useAccessibility } from '@/presentation/hooks/useAccessibility';
import { useGalaxyStore } from '@/presentation/store/galaxyStore';
import { useTourStore } from '@/presentation/store/tourStore';
import { useTimelineStore } from '@/presentation/store/timelineStore';
import { buildTimelineStats, type TimelineStats } from '@/domain/services/TimelineStats';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import { recitationPulseBus } from '@/presentation/audio/pulseBus';

interface RawNode {
  id: string;
  refType: 'POET' | 'WORK';
  refId: string;
  position: { x: number; y: number; z: number };
  basePosition: { x: number; y: number; z: number };
  dynasty: string;
  genre: null;
  size: number;
  brightness: number;
  phase: number;
  state: 'IDLE';
  label: string;
  birthYear?: number | null;
}

/** 经纬度线性投影到星系盘平面：经度→X，纬度→Z（北为 -Z），并做确定性抖散避免同地重叠 */
function projectHometownToGeo(nodeId: string, poet: PoetDTO | undefined): { x: number; y: number; z: number } | null {
  if (poet?.hometownLatitude == null || poet?.hometownLongitude == null) return null;
  let hash = 2166136261;
  for (let i = 0; i < nodeId.length; i++) {
    hash ^= nodeId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = hash >>> 0;
  const angle = ((seed % 360) / 180) * Math.PI;
  const radius = (((seed >>> 8) % 100) / 100) * 3.2;
  return {
    x: projectGeoX(poet.hometownLongitude) + Math.cos(angle) * radius,
    y: (((seed >>> 16) % 100) - 50) / 50 * 1.5,
    z: projectGeoZ(poet.hometownLatitude) + Math.sin(angle) * radius,
  };
}

export function Galaxy() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GalaxyScene | null>(null);
  const canvas2dRef = useRef<Canvas2DEngine | null>(null);
  const textRef = useRef<TextFallbackEngine | null>(null);
  const [rawNodes, setRawNodes] = useState<RawNode[]>([]);
  const [geoCoverage, setGeoCoverage] = useState<{ mapped: number; total: number }>({ mapped: 0, total: 0 });
  const [timelineStats, setTimelineStats] = useState<TimelineStats | null>(null);
  const galaxyDataRef = useRef<{ poetMap: Map<string, PoetDTO>; scoreMap: Map<string, ScoreDTO> } | null>(null);
  /** 中国轮廓顶点缓存：首次进入地理模式时懒加载，切回星系后再次进入无需重新请求 */
  const geoOutlineRef = useRef<number[] | null>(null);

  const { preferences } = useAccessibility();

  const isLoading = useGalaxyStore((s) => s.isLoading);
  const loadingStep = useGalaxyStore((s) => s.loadingStep);
  const rendererType = useGalaxyStore((s) => s.rendererType);
  const selectedNode = useGalaxyStore((s) => s.selectedNode);
  const selectedPoet = useGalaxyStore((s) => s.selectedPoet);
  const convergenceState = useGalaxyStore((s) => s.convergenceState);
  const isDivergenceActive = useGalaxyStore((s) => s.isDivergenceActive);
  const nodeCount = useGalaxyStore((s) => s.nodeCount);
  const focusedRelations = useGalaxyStore((s) => s.focusedRelations);
  const isCompareOpen = useGalaxyStore((s) => s.isCompareOpen);
  const comparePoetId = useGalaxyStore((s) => s.comparePoetId);
  const layoutMode = useGalaxyStore((s) => s.layoutMode);

  const tourStatus = useTourStore((s) => s.status);
  const tourId = useTourStore((s) => s.tour?.id ?? null);
  const tourStepIndex = useTourStore((s) => s.stepIndex);
  const tourStep = useTourStore((s) => s.step);
  const tourActive =
    tourStatus === 'loading' || tourStatus === 'playing' ||
    tourStatus === 'paused' || tourStatus === 'finished';

  const [timelineUseCase] = useState(() => new TimeTravelUseCase());
  const reducedMotionRef = useRef(preferences.reducedMotion);
  const timelineActive = useTimelineStore((s) => s.active);
  const timelineFrom = useTimelineStore((s) => s.fromYear);
  const timelineTo = useTimelineStore((s) => s.toYear);

  // —— 分享态：搜索词与卡片文案 ——
  const [searchQuery, setSearchQuery] = useState('');
  const [sharedQuery, setSharedQuery] = useState<string | null>(null);
  const [cardContent, setCardContent] = useState<CardContent | null>(null);

  useEffect(() => {
    const poet = selectedPoet?.poet;
    if (!poet) return;

    let cancelled = false;
    DataLoader.getInstance().loadWorkShard(poet.id)
      .then((shard) => {
        if (cancelled) return;
        const work = shard.works[0];
        setCardContent({
          title: work?.title ?? poet.name,
          poetName: poet.name,
          dynasty: getDynastyName(poet.dynasty),
          lines: (work?.text ?? poet.biography ?? '').slice(0, 80),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCardContent({
          title: poet.name,
          poetName: poet.name,
          dynasty: getDynastyName(poet.dynasty),
          lines: (poet.biography ?? '').slice(0, 80),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPoet]);

  // —— 时间演化回放：状态推送驱动场景按年份剔除 ——
  const syncTimeTravel = useCallback((state: TimeTravelState) => {
    const from = state.active ? state.fromYear : null;
    const to = state.active ? state.currentYear : null;
    // 亮度渐入跨度对应 0.6 秒播放时长；减少动效时直接切换
    const fadeYears = state.status === 'playing' && !reducedMotionRef.current
      ? (state.toYear - state.fromYear) * state.speed * 0.01
      : 0;

    sceneRef.current?.setTimeTravelActive(state.active);
    sceneRef.current?.setVisibleRange(from, to, fadeYears);
    canvas2dRef.current?.setVisibleRange(from, to);
    textRef.current?.setVisibleRange(from, to);
  }, []);

  useEffect(() => {
    reducedMotionRef.current = preferences.reducedMotion;
  }, [preferences.reducedMotion]);

  useEffect(() => {
    const unsubscribe = timelineUseCase.subscribe((state) => {
      useTimelineStore.getState().applyState(state);
      syncTimeTravel(state);
    });
    return () => {
      unsubscribe();
      timelineUseCase.exit();
    };
  }, [syncTimeTravel, timelineUseCase]);

  // 主题漫游与时间回放互斥
  useEffect(() => {
    if (tourActive) timelineUseCase.exit();
  }, [tourActive, timelineUseCase]);

  const yearBounds = useMemo(() => {
    if (rawNodes.length === 0) return { minYear: 0, maxYear: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const node of rawNodes) {
      const year = node.birthYear ?? 0;
      if (year < min) min = year;
      if (year > max) max = year;
    }
    return { minYear: min, maxYear: max };
  }, [rawNodes]);

  // —— 悬停工具提示 ——
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cameraRestoreTimer: ReturnType<typeof setTimeout> | null = null;
    const root = CompositionRoot.getInstance();

    const initScene = async () => {
      try {
        useGalaxyStore.getState().setLoading(true);
        useGalaxyStore.getState().setLoadingStep('wasm');

        await root.initialize();

        useGalaxyStore.getState().setLoadingStep('data');

        const type = detectWebGLSupport();
        if (cancelled) return;
        useGalaxyStore.getState().setRendererType(type);

        const galaxyData = await root.initializeUseCase.execute();
        if (cancelled) return;
        useGalaxyStore.getState().setLoadingStep('render');

        const rawNodes: RawNode[] = galaxyData.nodes.map((n) => ({
          id: n.id,
          refType: n.refType as 'POET',
          refId: n.refId,
          position: n.position,
          basePosition: { ...n.position },
          dynasty: n.dynasty,
          genre: null,
          size: n.size,
          brightness: n.brightness,
          phase: Math.random() * Math.PI * 2,
          state: 'IDLE' as const,
          label: n.label,
          birthYear: n.birthYear ?? null,
        }));

        setRawNodes(rawNodes);
        galaxyDataRef.current = { poetMap: galaxyData.poetMap, scoreMap: galaxyData.scoreMap };

        let mappedPoets = 0;
        let totalPoets = 0;
        for (const node of galaxyData.nodes) {
          if (node.refType !== 'POET') continue;
          totalPoets++;
          const poet = galaxyData.poetMap.get(node.refId);
          if (poet?.hometownLatitude != null && poet?.hometownLongitude != null) mappedPoets++;
        }
        setGeoCoverage({ mapped: mappedPoets, total: totalPoets });
        setTimelineStats(
          buildTimelineStats(
            galaxyData.nodes.map((node) => ({
              birthYear: node.birthYear,
              workCount: galaxyData.poetMap.get(node.refId)?.workCount,
            }))
          )
        );

        useGalaxyStore.getState().setNodes(
          rawNodes.map((n) => ({
            id: n.id,
            refType: n.refType,
            refId: n.refId,
            position: n.position,
            dynasty: n.dynasty,
            size: n.size,
            brightness: n.brightness,
            label: n.label,
          })),
          Object.fromEntries(galaxyData.poetMap.entries())
        );

        const storeSetters = {
          selectNode: (rawNode: RawNode | null) => {
            if (!rawNode) {
              useGalaxyStore.getState().selectNode(null);
              useGalaxyStore.getState().selectPoet(null);
              return;
            }

            useGalaxyStore.getState().selectNode({
              id: rawNode.id,
              refType: rawNode.refType,
              refId: rawNode.refId,
              position: rawNode.position,
              dynasty: rawNode.dynasty,
              size: rawNode.size,
              brightness: rawNode.brightness,
              label: rawNode.label,
            });

            const current = galaxyDataRef.current;
            if (!current) return;

            const poetId = rawNode.refId;

            const poetDTO = current.poetMap.get(poetId);
            if (poetDTO) {
              const scoreDTO = current.scoreMap.get(poetId);
              useGalaxyStore.getState().selectPoet({
                poet: {
                  id: poetDTO.id,
                  name: poetDTO.name,
                  dynasty: poetDTO.dynasty,
                  biography: poetDTO.biography,
                  workCount: poetDTO.workCount,
                  hometown: poetDTO.hometown,
                  hometownLatitude: poetDTO.hometownLatitude,
                  hometownLongitude: poetDTO.hometownLongitude,
                },
                score: scoreDTO ? {
                  poetId: poetId,
                  poetName: poetDTO.name,
                  dynasty: poetDTO.dynasty,
                  talent: scoreDTO.talent,
                  popularity: scoreDTO.popularity,
                  luck: scoreDTO.luck,
                  factors: scoreDTO.factors,
                } : null,
                node: {
                  id: rawNode.id,
                  refType: rawNode.refType,
                  refId: rawNode.refId,
                  position: rawNode.position,
                  dynasty: rawNode.dynasty,
                  size: rawNode.size,
                  brightness: rawNode.brightness,
                  label: rawNode.label,
                },
              });
            }
          },
        };

        if (type === 'webgl') {
          useGalaxyStore.getState().setLoadingStep('scene');
          const scene = new GalaxyScene(container);
          sceneRef.current = scene;

          await scene.loadNodes(rawNodes);
          scene.setOnNodeSelect((rawNode) => storeSetters.selectNode(rawNode as RawNode | null));
          scene.setOnDivergenceChange((active) => useGalaxyStore.getState().setDivergenceActive(active));
          scene.setOnConvergenceChange((state) => useGalaxyStore.getState().setConvergenceState(state));
          scene.setOnHover((info) => setHoverInfo(info));
        } else if (type === 'canvas2d') {
          const engine = new Canvas2DEngine(container);
          canvas2dRef.current = engine;
          await engine.loadNodes(rawNodes);
          engine.setOnNodeSelect((rawNode) => storeSetters.selectNode(rawNode as RawNode | null));
        } else {
          const engine = new TextFallbackEngine(container);
          textRef.current = engine;
          await engine.loadNodes(rawNodes);
          engine.setOnNodeSelect((rawNode) => storeSetters.selectNode(rawNode as RawNode | null));
        }

        // —— 复现分享链接中的完整视图：时间区间、搜索态、焦点与相机 ——
        const shared = root.generateShareLinkUseCase.parseFromUrl();
        if (shared) {
          if (shared.searchQuery) {
            setSharedQuery(shared.searchQuery);
            setSearchQuery(shared.searchQuery);
          }
          if (shared.timeRange) {
            timelineUseCase.setRange(shared.timeRange.fromYear, shared.timeRange.toYear);
          }

          const focusedNode = shared.focusedNodeId
            ? rawNodes.find((n) => n.refId === shared.focusedNodeId || n.id === shared.focusedNodeId)
            : undefined;
          if (focusedNode) sceneRef.current?.focusNode(focusedNode);

          const restoreCamera = () => sceneRef.current?.applyCameraState(shared.cameraPosition, shared.cameraTarget);
          if (focusedNode && !preferences.reducedMotion) {
            // 等待焦点收敛动画结束后再还原分享的相机位置
            cameraRestoreTimer = setTimeout(restoreCamera, 1100);
          } else {
            restoreCamera();
          }
        }

        useGalaxyStore.getState().setLoading(false);
      } catch (error) {
        if (!cancelled) {
          useGalaxyStore.getState().setLoading(false);
          root.logError('Galaxy', '星系初始化失败', { error: String(error) });
        }
      }
    };

    initScene();

    return () => {
      cancelled = true;
      if (cameraRestoreTimer) clearTimeout(cameraRestoreTimer);
      sceneRef.current?.dispose();
      canvas2dRef.current?.dispose();
      textRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 布局切换：按籍贯经纬度重投影（缺失坐标的节点回退螺旋基准位置） ——
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || rendererType !== 'webgl' || isLoading) return;
    if (layoutMode === 'spiral') {
      scene.setLayoutMode('spiral');
      return;
    }
    const poetMap = galaxyDataRef.current?.poetMap;
    const positions = new Map<string, { x: number; y: number; z: number }>();
    for (const node of rawNodes) {
      const geo = projectHometownToGeo(node.id, poetMap?.get(node.refId));
      if (geo) positions.set(node.id, geo);
    }
    scene.setLayoutMode('geo', positions);
  }, [layoutMode, rendererType, isLoading, rawNodes]);

  // —— 中国轮廓底图：进入地理模式时懒加载一次，加载失败不影响地理布局 ——
  useEffect(() => {
    if (layoutMode !== 'geo' || rendererType !== 'webgl' || isLoading) return;
    const scene = sceneRef.current;
    if (!scene) return;

    if (geoOutlineRef.current) {
      scene.setGeoOutline(geoOutlineRef.current);
      return;
    }

    let cancelled = false;
    fetch('/data/geo/china.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((geojson: unknown) => {
        if (cancelled) return;
        const vertices = buildGeoOutlineVertices(geojson);
        geoOutlineRef.current = vertices;
        sceneRef.current?.setGeoOutline(vertices);
      })
      .catch(() => {
        // 轮廓底图缺失时静默降级，仍保留经纬网格与星点
      });

    return () => {
      cancelled = true;
    };
  }, [layoutMode, rendererType, isLoading]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setReducedMotion(preferences.reducedMotion);
    }
    const fontSizeMap = { small: '14px', medium: '16px', large: '18px' };
    document.documentElement.style.fontSize = fontSizeMap[preferences.fontSize];
    document.documentElement.classList.toggle('high-contrast', preferences.highContrast);
  }, [preferences]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sceneRef.current) sceneRef.current.unfocus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // —— 朗诵节奏可视化：订阅朗诵脉动总线，驱动节点与星尘呼吸 ——
  useEffect(() => recitationPulseBus.subscribe((level) => {
    sceneRef.current?.setRecitationPulse(level);
  }), []);

  // —— 漫游模式：禁用散气自动触发；退出漫游后恢复星系原状 ——
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || rendererType !== 'webgl' || isLoading) return;
    scene.setTourActive(tourActive);
  }, [tourActive, rendererType, isLoading]);

  useEffect(() => {
    if (tourActive) return;
    sceneRef.current?.unfocus();
  }, [tourActive]);

  // —— 漫游步骤：focus 复用聚气收敛，cluster 复用星团镜头 ——
  const lastTourStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tourActive || tourStepIndex < 0 || !tourStep) {
      lastTourStepRef.current = null;
      return;
    }
    const scene = sceneRef.current;
    if (!scene || rendererType !== 'webgl') return;

    const key = `${tourId}:${tourStepIndex}`;
    if (lastTourStepRef.current === key) return;

    if (tourStep.type === 'focus' && tourStep.refId) {
      const rawNode = rawNodes.find((n) => n.refId === tourStep.refId);
      if (!rawNode) return;
      scene.focusNode(rawNode);
    } else if (tourStep.type === 'cluster' && tourStep.clusterKey) {
      scene.focusCluster(tourStep.clusterKey);
    }
    lastTourStepRef.current = key;
  }, [tourActive, tourId, tourStepIndex, tourStep, rawNodes, rendererType]);

  // —— 聚焦后懒加载文脉关系，驱动类型化气流与关系谱 ——
  useEffect(() => {
    const focusId = selectedNode?.id;
    if (!focusId || rendererType !== 'webgl') {
      useGalaxyStore.getState().setFocusedRelations(null);
      return;
    }
    let cancelled = false;
    CompositionRoot.getInstance()
      .getPoetRelationsUseCase.execute(focusId)
      .then((relations) => {
        if (cancelled) return;
        const items = relations.map((r) => ({
          sourceId: r.sourceId,
          targetId: r.targetId,
          type: r.relationType,
          weight: r.weight,
          evidence: r.evidence,
        }));
        useGalaxyStore.getState().setFocusedRelations(items);

        // 场景关系流：对端节点从 rawNodes 取位（含 basePosition），仅保留场景内可定位的目标
        const scene = sceneRef.current;
        if (!scene) return;
        const flows = items.flatMap((it) => {
          const otherId = it.sourceId === focusId ? it.targetId : it.sourceId;
          const node = rawNodes.find((n) => n.id === otherId);
          return node ? [{ node, type: it.type, weight: it.weight }] : [];
        });
        scene.setRelationFlows(focusId, flows);
      })
      .catch(() => {
        if (!cancelled) useGalaxyStore.getState().setFocusedRelations([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, rendererType]);

  // 关系谱跳转聚焦：按诗人 refId 定位节点并触发聚气
  const handleFocusPoet = useCallback((poetId: string) => {
    const rawNode = rawNodes.find((n) => n.refId === poetId);
    if (rawNode) sceneRef.current?.focusNode(rawNode);
  }, [rawNodes]);

  // —— 双诗人对比：切换聚焦诗人时收起对比面板 ——
  useEffect(() => {
    useGalaxyStore.getState().setCompareOpen(false);
    useGalaxyStore.getState().setComparePoetId(null);
  }, [selectedNode?.id]);

  // —— 双诗人对比：把对比诗人的关系流叠加到场景关系网 ——
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || rendererType !== 'webgl') return;
    if (!comparePoetId || !selectedNode) {
      scene.clearCompareRelations();
      return;
    }
    const compareNode = rawNodes.find((n) => n.refType === 'POET' && n.refId === comparePoetId);
    if (!compareNode) return;

    let cancelled = false;
    CompositionRoot.getInstance()
      .getPoetRelationsUseCase.execute(compareNode.id)
      .then((rels) => {
        if (cancelled) return;
        const flows = rels.flatMap((r) => {
          const otherId = r.sourceId === compareNode.id ? r.targetId : r.sourceId;
          const other = rawNodes.find((n) => n.id === otherId);
          return other ? [{ node: other, type: r.relationType, weight: r.weight }] : [];
        });
        sceneRef.current?.setCompareRelations(compareNode, flows);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparePoetId, selectedNode?.id, rendererType, rawNodes]);

  const handleSearchNodeSelect = useCallback((node: { id: string; refId: string }) => {
    const rawNode = rawNodes.find((n) => n.id === node.id);
    if (rawNode) {
      sceneRef.current?.focusNode(rawNode);
      canvas2dRef.current?.focusNode(rawNode);
      textRef.current?.focusNode(rawNode);
    }
  }, [rawNodes]);

  const handleWeightsChange = useCallback((weights: { talent: number; popularity: number; luck: number }) => {
    sceneRef.current?.updateDimensionWeights(weights);
  }, []);

  const getRenderer = useCallback(() => sceneRef.current?.getRenderer() ?? null, []);
  const getCamera = useCallback(() => sceneRef.current?.getCamera() ?? null, []);
  const getCameraTarget = useCallback(() => sceneRef.current?.getCameraTarget() ?? null, []);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full pb-12 sm:pb-0"
        style={{ minHeight: '100vh' }}
        role="application"
        aria-label="文气星系可视化"
        aria-roledescription="三维星系可视化"
        tabIndex={0}
      />

      <WelcomeGuide />
      <LoadingOverlay isLoading={isLoading} currentStep={loadingStep} />
      <RendererBanner rendererType={rendererType} isLoading={isLoading} />

      {rendererType === 'webgl' && !tourActive && (
        <Search
          key={sharedQuery ?? 'search'}
          nodes={rawNodes}
          onNodeSelect={handleSearchNodeSelect}
          initialQuery={sharedQuery}
          onQueryChange={setSearchQuery}
        />
      )}
      {rendererType === 'webgl' && !tourActive && <DimensionSlider onWeightsChange={handleWeightsChange} />}
      {rendererType === 'webgl' && !tourActive && (
        <Share
          getRenderer={getRenderer}
          getCamera={getCamera}
          getCameraTarget={getCameraTarget}
          focusedNodeId={selectedNode?.refId || null}
          timeRange={timelineActive ? { fromYear: timelineFrom, toYear: timelineTo } : null}
          searchQuery={searchQuery}
          cardContent={selectedPoet ? cardContent : null}
        />
      )}
      {rendererType === 'webgl' && !tourActive && (
        <StarList onFocusPoet={handleFocusPoet} />
      )}

      {rendererType === 'webgl' && !tourActive && !isCompareOpen && (
        <DailyPoemCard onFocusPoet={handleFocusPoet} />
      )}

      <AccessibilityPanel />
      <MobileNav />

      {!tourActive && (
        <InfoPanel
          nodeCount={nodeCount}
          rendererType={rendererType}
          convergenceState={convergenceState}
          isDivergenceActive={isDivergenceActive}
          layoutMode={layoutMode}
          geoCoverage={geoCoverage}
          onLayoutChange={(mode) => useGalaxyStore.getState().setLayoutMode(mode)}
          onOpenTour={() => useTourStore.getState().setPickerOpen(true)}
        />
      )}

      {selectedNode && selectedPoet && rendererType === 'webgl' && !tourActive && (
        <PoetDetailPanel
          key={selectedPoet.poet.id}
          poet={{
            ...selectedPoet.poet,
            talent: selectedPoet.score?.talent,
            popularity: selectedPoet.score?.popularity,
            luck: selectedPoet.score?.luck,
            factors: selectedPoet.score?.factors,
          }}
          relations={focusedRelations}
          onFocusPoet={handleFocusPoet}
          onCompare={() => useGalaxyStore.getState().setCompareOpen(true)}
          onClose={() => sceneRef.current?.unfocus()}
        />
      )}

      {selectedNode && selectedPoet && rendererType === 'webgl' && !tourActive && isCompareOpen && (
        <ComparePanel
          primary={{
            id: selectedPoet.poet.id,
            name: selectedPoet.poet.name,
            dynasty: selectedPoet.poet.dynasty,
            workCount: selectedPoet.poet.workCount,
            talent: selectedPoet.score?.talent,
            popularity: selectedPoet.score?.popularity,
            luck: selectedPoet.score?.luck,
          }}
          relations={focusedRelations}
          onClose={() => {
            useGalaxyStore.getState().setCompareOpen(false);
            useGalaxyStore.getState().setComparePoetId(null);
          }}
        />
      )}

      {rendererType === 'webgl' && !tourActive && <AxisLegend />}
      {rendererType === 'webgl' && !tourActive && <DynastyLegend />}

      {rendererType !== 'text' && !tourActive && !isLoading && timelineUseCase && (
        <Timeline
          useCase={timelineUseCase}
          minYear={yearBounds.minYear}
          maxYear={yearBounds.maxYear}
          stats={timelineStats}
        />
      )}

      {rendererType === 'webgl' && <TourOverlay />}

      {/* 悬停工具提示 */}
      {hoverInfo && rendererType === 'webgl' && (
        <div
          className="fixed pointer-events-none z-[60] glass-panel px-3 py-2 animate-fade-in-scale"
          style={{
            left: hoverInfo.screenX + 14,
            top: hoverInfo.screenY - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="text-body text-white/80 font-medium whitespace-nowrap">{hoverInfo.node.label}</div>
          <div className="text-caption text-white/40">
            {getDynastyName(hoverInfo.node.dynasty)}
          </div>
        </div>
      )}
    </div>
  );
}
