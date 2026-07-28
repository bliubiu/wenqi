export interface GenerateShareLinkRequest {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  focusedNodeId: string | null;
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

    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost:3000/';
    const url = `${baseUrl}?${params.toString()}`;

    return { url };
  }

  parseFromUrl(): GenerateShareLinkRequest | null {
    const params = new URLSearchParams(window.location.search);

    const cx = params.get('cx');
    const cy = params.get('cy');
    const cz = params.get('cz');
    const tx = params.get('tx');
    const ty = params.get('ty');
    const tz = params.get('tz');

    if (!cx || !cy || !cz || !tx || !ty || !tz) return null;

    return {
      cameraPosition: [parseFloat(cx), parseFloat(cy), parseFloat(cz)],
      cameraTarget: [parseFloat(tx), parseFloat(ty), parseFloat(tz)],
      focusedNodeId: params.get('focus') ?? null,
    };
  }
}
