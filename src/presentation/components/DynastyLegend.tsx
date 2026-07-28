'use client';

const DYNASTY_ITEMS = [
  { code: 'PRE_QIN', label: '先秦', color: '#3A4A5C' },
  { code: 'HAN', label: '汉', color: '#8B7355' },
  { code: 'WEI_JIN', label: '魏晋', color: '#6FAE8E' },
  { code: 'TANG', label: '唐', color: '#D4A24C' },
  { code: 'SONG', label: '宋', color: '#7BA7D9' },
  { code: 'YUAN', label: '元', color: '#B5523E' },
  { code: 'MING', label: '明', color: '#C9866B' },
  { code: 'QING', label: '清', color: '#8C6FAE' },
  { code: 'MODERN', label: '近现代', color: '#5A8C7A' },
];

export function DynastyLegend() {
  return (
    <div className="absolute bottom-16 sm:bottom-4 right-2 sm:right-4 glass-panel text-white p-3 animate-fade-in-up">
      <h3 className="text-caption text-white/50 mb-2 font-medium">朝代</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {DYNASTY_ITEMS.map((item) => (
          <div key={item.code} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
            <span className="text-caption text-white/60">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
