export interface ShareTimeRange {
  fromYear: number;
  toYear: number;
}

export interface GenerateShareLinkRequest {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  focusedNodeId: string | null;
  /** 时间区间（WQ-3 回放态），可选 */
  timeRange?: ShareTimeRange | null;
  /** 语义/全文搜索关键词，可选 */
  searchQuery?: string | null;
}

export interface GenerateShareLinkResponse {
  url: string;
}

export class GenerateShareLinkUseCase {
  execute(request: GenerateShareLinkRequest): GenerateShareLinkResponse {
    const params = new URLSearchParams();

    params.set('cx', request.cameraPosition[0].toFixed(2));
    params.set('cy', request.cameraPosition[1].toFixed(2));
    params.set('cz', request.cameraPosition[2].toFixed(2));
    params.set('tx', request.cameraTarget[0].toFixed(2));
    params.set('ty', request.cameraTarget[1].toFixed(2));
    params.set('tz', request.cameraTarget[2].toFixed(2));

    if (request.focusedNodeId) {
      params.set('focus', request.focusedNodeId);
    }

    if (request.timeRange) {
      params.set('yr', `${Math.round(request.timeRange.fromYear)},${Math.round(request.timeRange.toYear)}`);
    }

    if (request.searchQuery?.trim()) {
      params.set('q', request.searchQuery.trim());
    }

    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost:3000/';
    const url = `${baseUrl}?${params.toString()}`;

    return { url };
  }

  /** 生成携带漫游 ID 的直达链接（分享漫游用） */
  generateTourLink(tourId: string): string {
    const params = new URLSearchParams();
    params.set('tour', tourId);

    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost:3000/';
    return `${baseUrl}?${params.toString()}`;
  }

  /** 从当前 URL 解析漫游 ID（分享直达用），无参数时返回 null */
  parseTourIdFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const id = new URLSearchParams(window.location.search).get('tour');
    return id && id.trim() !== '' ? id.trim() : null;
  }

  parseFromUrl(): GenerateShareLinkRequest | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);

    const cx = params.get('cx');
    const cy = params.get('cy');
    const cz = params.get('cz');
    const tx = params.get('tx');
    const ty = params.get('ty');
    const tz = params.get('tz');

    if (!cx || !cy || !cz || !tx || !ty || !tz) return null;

    const position = [parseFloat(cx), parseFloat(cy), parseFloat(cz)] as [number, number, number];
    const target = [parseFloat(tx), parseFloat(ty), parseFloat(tz)] as [number, number, number];
    if ([...position, ...target].some((n) => Number.isNaN(n))) return null;

    const yr = params.get('yr');
    let timeRange: ShareTimeRange | null = null;
    if (yr) {
      const [from, to] = yr.split(',').map((part) => parseFloat(part));
      if (Number.isFinite(from) && Number.isFinite(to)) {
        timeRange = { fromYear: from, toYear: to };
      }
    }

    const query = params.get('q');

    return {
      cameraPosition: position,
      cameraTarget: target,
      focusedNodeId: params.get('focus') ?? null,
      timeRange,
      searchQuery: query && query.trim() !== '' ? query.trim() : null,
    };
  }
}
