'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { GalaxyScene, HoverInfo } from '@/presentation/scene/GalaxyScene';
import { Canvas2DEngine } from '@/presentation/scene/Canvas2DEngine';
import { TextFallbackEngine } from '@/presentation/scene/TextFallbackEngine';
import { detectWebGLSupport } from '@/presentation/scene/RendererFactory';
import { CompositionRoot } from '@/di/composition-root';
import { Search } from './Search';
import { DimensionSlider } from './DimensionSlider';
import { Share } from './Share';
import { AccessibilityPanel } from './AccessibilityPanel';
import { InfoPanel } from './InfoPanel';
import { PoetDetailPanel } from './PoetDetailPanel';
import { AxisLegend } from './AxisLegend';
import { DynastyLegend } from './DynastyLegend';
import { LoadingOverlay } from './LoadingOverlay';
import { WelcomeGuide } from './WelcomeGuide';
import { RendererBanner } from './RendererBanner';
import { MobileNav } from './MobileNav';
import type { PoetDTO, ScoreDTO } from '@/application/dto/GalaxyDTO';
import { useAccessibility } from '@/presentation/hooks/useAccessibility';
import { useGalaxyStore } from '@/presentation/store/galaxyStore';
import { useUIStore } from '@/presentation/store/uiStore';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';

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
}

export function Galaxy() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GalaxyScene | null>(null);
  const canvas2dRef = useRef<Canvas2DEngine | null>(null);
  const textRef = useRef<TextFallbackEngine | null>(null);
  const rawNodesRef = useRef<RawNode[]>([]);
  const galaxyDataRef = useRef<{ poetMap: Map<string, PoetDTO>; scoreMap: Map<string, ScoreDTO> } | null>(null);

  const { preferences } = useAccessibility();

  const isLoading = useGalaxyStore((s) => s.isLoading);
  const loadingStep = useGalaxyStore((s) => s.loadingStep);
  const rendererType = useGalaxyStore((s) => s.rendererType);
  const selectedNode = useGalaxyStore((s) => s.selectedNode);
  const selectedPoet = useGalaxyStore((s) => s.selectedPoet);
  const convergenceState = useGalaxyStore((s) => s.convergenceState);
  const isDivergenceActive = useGalaxyStore((s) => s.isDivergenceActive);
  const nodeCount = useGalaxyStore((s) => s.nodeCount);

  // —— 悬停工具提示 ——
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
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
        }));

        rawNodesRef.current = rawNodes;
        galaxyDataRef.current = { poetMap: galaxyData.poetMap, scoreMap: galaxyData.scoreMap };

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
                },
                score: scoreDTO ? { poetId: poetId, poetName: poetDTO.name, dynasty: poetDTO.dynasty, talent: scoreDTO.talent, popularity: scoreDTO.popularity, luck: scoreDTO.luck } : null,
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
      sceneRef.current?.dispose();
      canvas2dRef.current?.dispose();
      textRef.current?.dispose();
    };
  }, []);

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

  const handleSearchNodeSelect = useCallback((node: { id: string; refId: string }) => {
    const rawNode = rawNodesRef.current.find((n) => n.id === node.id);
    if (rawNode) {
      sceneRef.current?.focusNode(rawNode);
      canvas2dRef.current?.focusNode(rawNode);
      textRef.current?.focusNode(rawNode);
    }
  }, []);

  const handleWeightsChange = useCallback((weights: { talent: number; popularity: number; luck: number }) => {
    sceneRef.current?.updateDimensionWeights(weights);
  }, []);

  const getRenderer = useCallback(() => sceneRef.current?.getRenderer() ?? null, []);
  const getCamera = useCallback(() => sceneRef.current?.getCamera() ?? null, []);

  const dimensionBtnRef = useRef<HTMLButtonElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const a11yBtnRef = useRef<HTMLButtonElement>(null);

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

      {rendererType === 'webgl' && (
        <Search nodes={rawNodesRef.current} onNodeSelect={handleSearchNodeSelect} />
      )}
      {rendererType === 'webgl' && <DimensionSlider onWeightsChange={handleWeightsChange} />}
      {rendererType === 'webgl' && (
        <Share
          getRenderer={getRenderer}
          getCamera={getCamera}
          focusedNodeId={selectedNode?.refId || null}
        />
      )}

      <AccessibilityPanel />
      <MobileNav />

      <InfoPanel
        nodeCount={nodeCount}
        rendererType={rendererType}
        convergenceState={convergenceState}
        isDivergenceActive={isDivergenceActive}
      />

      {selectedNode && selectedPoet && rendererType === 'webgl' && (
        <PoetDetailPanel
          poet={selectedPoet.poet}
          onClose={() => sceneRef.current?.unfocus()}
        />
      )}

      {rendererType === 'webgl' && <AxisLegend />}
      {rendererType === 'webgl' && <DynastyLegend />}

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
