'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CompositionRoot } from '@/di/composition-root';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import { useGalaxyStore } from '@/presentation/store/galaxyStore';
import { useUIStore } from '@/presentation/store/uiStore';
import { DataLoader } from '@/infrastructure/data/DataLoader';

interface SearchResultItem {
  id: string;
  refType: 'POET' | 'WORK';
  refId: string;
  title: string;
  subtitle: string;
  dynasty: string;
  snippet?: string;
}

interface SearchProps {
  nodes: Array<{ id: string; label: string; dynasty: string; refId: string; refType: string }>;
  onNodeSelect: (node: { id: string; refId: string }) => void;
}

export function Search({ nodes, onNodeSelect }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rootRef = useRef(CompositionRoot.getInstance());

  const searchOpen = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);

  const nodeMap = useRef<Map<string, (typeof nodes)[number]>>(new Map());

  useEffect(() => {
    nodeMap.current.clear();
    nodes.forEach((node) => nodeMap.current.set(node.refId, node));
  }, [nodes]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSearchOpen(false);
      return;
    }

    const queryLower = searchQuery.toLowerCase();
    const seen = new Set<string>();
    const matchedNodes: SearchResultItem[] = [];

    const addResult = (item: SearchResultItem) => {
      const key = `${item.refType}:${item.refId}`;
      if (!seen.has(key) && matchedNodes.length < 20) {
        seen.add(key);
        matchedNodes.push(item);
      }
    };

    try {
      const result = await rootRef.current.searchUseCase.execute(searchQuery);
      for (const node of result) {
        addResult({
          id: node.id,
          refType: node.refType,
          refId: node.refId,
          title: node.label,
          subtitle: `${getDynastyName(node.dynasty)} · ${node.refType === 'POET' ? '诗人' : '作品'}`,
          dynasty: node.dynasty,
        });
      }
    } catch {
      for (const node of nodes) {
        if (node.label.toLowerCase().includes(queryLower)) {
          addResult({
            id: node.id,
            refType: node.refType as 'POET',
            refId: node.refId,
            title: node.label,
            subtitle: `${getDynastyName(node.dynasty)} · ${node.refType === 'POET' ? '诗人' : '作品'}`,
            dynasty: node.dynasty,
          });
        }
      }
    }

    // 对命中诗人按需加载作品分片，匹配作品标题与文本（分片经 DataLoader 缓存，重复搜索零开销）
    const matchedPoets = [...new Set(matchedNodes.filter((n) => n.refType === 'POET').map((n) => n.refId))].slice(0, 5);
    await Promise.all(matchedPoets.map(async (poetId) => {
      try {
        const shard = await DataLoader.getInstance().loadWorkShard(poetId);
        for (const w of shard.works) {
          if (matchedNodes.length >= 20) break;
          const matchTitle = w.title.toLowerCase().includes(queryLower);
          const matchText = (w.text || '').substring(0, 60).toLowerCase().includes(queryLower);
          if (!matchTitle && !matchText) continue;

          addResult({
            id: `work_${w.poetId}_${w.title.slice(0, 20)}`,
            refType: 'POET',
            refId: w.poetId,
            title: w.title,
            subtitle: `${w.poetName} · 作品`,
            dynasty: w.dynasty,
            snippet: (w.text || '').substring(0, 80),
          });
        }
      } catch {
        // 分片加载失败时跳过该诗人的作品匹配
      }
    }));

    setResults(matchedNodes);
    setSearchOpen(matchedNodes.length > 0);
    setSelectedIndex(-1);
  }, [nodes, setSearchOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!searchOpen) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setSearchOpen(false);
        setQuery('');
        break;
    }
  };

  const handleSelectResult = (result: SearchResultItem) => {
    const node = nodeMap.current.get(result.refId);
    if (node) {
      onNodeSelect(node);
      setQuery(result.title);
      setSearchOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        resultsRef.current && !resultsRef.current.contains(event.target as Node) &&
        inputRef.current && !inputRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setSearchOpen]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[calc(100%-2rem)] sm:w-96 z-50">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setSearchOpen(true)}
          placeholder="搜索诗人、作品..."
          className="w-full px-4 py-3 pl-10 glass-panel text-white rounded-lg border border-white/20 focus:border-white/40 focus:outline-none placeholder-white/30 transition-all duration-200"
        />
        <svg className="absolute left-3 top-3.5 h-5 w-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <div className="absolute right-3 top-3 text-caption text-white/30">Ctrl+K</div>
      </div>

      {searchOpen && results.length > 0 && (
        <div ref={resultsRef} className="absolute top-full left-0 right-0 mt-2 glass-panel-heavy max-h-96 overflow-y-auto z-50 animate-fade-in-up">
          {results.map((result, index) => (
            <div
              key={result.id}
              onClick={() => handleSelectResult(result)}
              className={`px-4 py-3 cursor-pointer transition-colors duration-150 ${index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <div className="flex items-center">
                <div className="flex-1 min-w-0">
                  <div className="text-body text-white/80 font-medium truncate">{result.title}</div>
                  <div className="text-caption text-white/40 truncate">{result.subtitle}</div>
                  {result.snippet && (
                    <div className="text-caption text-white/30 truncate mt-0.5">{result.snippet}</div>
                  )}
                </div>
                <div className="text-caption text-white/30 shrink-0 ml-2">{getDynastyName(result.dynasty)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {searchOpen && query && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-panel-heavy p-4 text-center text-white/40 text-body animate-fade-in-up">
          未找到匹配结果
        </div>
      )}
    </div>
  );
}
