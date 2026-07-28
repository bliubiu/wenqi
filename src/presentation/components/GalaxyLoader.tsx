'use client';

import dynamic from 'next/dynamic';

const GalaxyInner = dynamic(() => import('./Galaxy').then((m) => ({ default: m.Galaxy })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white text-lg">加载中...</p>
      </div>
    </div>
  ),
});

export function GalaxyLoader() {
  return <GalaxyInner />;
}
