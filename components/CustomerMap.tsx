'use client';

import { useEffect, useRef, useState } from 'react';

/* ── 지역 중심 좌표 ── */
const REGION_COORDS: Record<string, [number, number]> = {
  '서울': [37.5665, 126.9780], '서울특별시': [37.5665, 126.9780],
  '인천': [37.4563, 126.7052], '인천광역시': [37.4563, 126.7052],
  '경기': [37.4138, 127.5183], '경기도': [37.4138, 127.5183],
  '강원': [37.8228, 128.1555], '강원도': [37.8228, 128.1555], '강원특별자치도': [37.8228, 128.1555],
  '충북': [36.6357, 127.4912], '충청북도': [36.6357, 127.4912],
  '충남': [36.5184, 126.8000], '충청남도': [36.5184, 126.8000],
  '대전': [36.3504, 127.3845], '대전광역시': [36.3504, 127.3845],
  '세종': [36.4800, 127.2890], '세종특별자치시': [36.4800, 127.2890],
  '전북': [35.7175, 127.1530], '전라북도': [35.7175, 127.1530], '전북특별자치도': [35.7175, 127.1530],
  '전남': [34.8679, 126.9910], '전라남도': [34.8679, 126.9910],
  '광주': [35.1595, 126.8526], '광주광역시': [35.1595, 126.8526],
  '경북': [36.4919, 128.8889], '경상북도': [36.4919, 128.8889],
  '경남': [35.4606, 128.2132], '경상남도': [35.4606, 128.2132],
  '대구': [35.8714, 128.6014], '대구광역시': [35.8714, 128.6014],
  '울산': [35.5384, 129.3114], '울산광역시': [35.5384, 129.3114],
  '부산': [35.1796, 129.0756], '부산광역시': [35.1796, 129.0756],
  '제주': [33.4996, 126.5312], '제주특별자치도': [33.4996, 126.5312],
};

const COLORS = [
  '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#67e8f9',
  '#c4b5fd', '#86efac', '#fde68a', '#fb923c', '#60a5fa',
];

/* 주소 문자열에서 시군구 수준 좌표 보정 (패턴 매핑) */
const CITY_OFFSET: Array<{ pattern: RegExp; d: [number, number] }> = [
  { pattern: /강남|서초|송파/, d: [-0.04, 0.05] },
  { pattern: /강북|노원|도봉/, d: [0.07, -0.02] },
  { pattern: /마포|은평|서대문/, d: [0.01, -0.07] },
  { pattern: /성남|분당/, d: [-0.07, 0.06] },
  { pattern: /수원/, d: [-0.11, 0.04] },
  { pattern: /고양|일산/, d: [0.04, -0.08] },
  { pattern: /용인/, d: [-0.10, 0.10] },
  { pattern: /안양|군포/, d: [-0.12, 0.00] },
  { pattern: /부천/, d: [0.00, -0.10] },
  { pattern: /의정부/, d: [0.07, 0.04] },
  { pattern: /포항/, d: [-0.02, 0.10] },
  { pattern: /경주/, d: [-0.08, 0.06] },
  { pattern: /구미/, d: [0.05, -0.05] },
  { pattern: /안동/, d: [0.12, -0.04] },
  { pattern: /진주/, d: [-0.06, -0.04] },
  { pattern: /창원/, d: [-0.02, 0.04] },
  { pattern: /김해/, d: [-0.06, 0.10] },
  { pattern: /목포/, d: [-0.04, -0.12] },
  { pattern: /여수/, d: [0.02, 0.10] },
  { pattern: /순천/, d: [0.03, 0.08] },
  { pattern: /전주/, d: [0.02, -0.04] },
  { pattern: /익산/, d: [0.07, -0.09] },
  { pattern: /군산/, d: [0.09, -0.14] },
  { pattern: /청주/, d: [0.03, 0.00] },
  { pattern: /충주/, d: [0.10, 0.08] },
  { pattern: /천안/, d: [-0.06, -0.06] },
  { pattern: /아산/, d: [-0.04, -0.10] },
  { pattern: /홍성/, d: [-0.03, -0.17] },
  { pattern: /강릉/, d: [0.02, 0.17] },
  { pattern: /원주/, d: [-0.05, 0.05] },
  { pattern: /춘천/, d: [0.07, 0.00] },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/* ── region 값 → 좌표 (부분 포함 매칭 + 주소 폴백) ── */
function resolveCoords(region: string | null, address: string | null): [number, number] | null {
  const candidates = [
    region,
    address ? address.trim().split(/\s+/)[0] : null,  // 주소 첫 단어 (시도)
    address ? address.trim().split(/\s+/).slice(0, 2).join('') : null,  // 첫 두 단어 합침
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const s = raw.trim();
    // 1) 정확 매칭
    if (REGION_COORDS[s]) return REGION_COORDS[s];
    // 2) DB값이 키에 포함되거나, 키가 DB값에 포함
    for (const [key, coords] of Object.entries(REGION_COORDS)) {
      if (s.includes(key) || key.includes(s)) return coords;
    }
  }
  return null;
}

type MapRow = { manager: string; region: string | null; customer_name: string; address: string | null };

export default function CustomerMap() {
  const mapDivRef    = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<unknown>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch('/api/customers/map');
        if (!res.ok) throw new Error('데이터 로드 실패');
        const rows: MapRow[] = await res.json();
        if (cancelled) return;

        /* 담당자별 색상 (count 순위 기반) */
        const countMap = new Map<string, number>();
        for (const r of rows) countMap.set(r.manager, (countMap.get(r.manager) ?? 0) + 1);
        const managerRank = [...countMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([m]) => m);
        const colorOf = (m: string) => COLORS[managerRank.indexOf(m) % COLORS.length] ?? '#94a3b8';

        /* Leaflet CSS */
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css'; link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        /* Leaflet 팝업 다크테마 오버라이드 */
        if (!document.getElementById('leaflet-dark-css')) {
          const s = document.createElement('style');
          s.id = 'leaflet-dark-css';
          s.textContent = `
            .leaflet-popup-content-wrapper{background:#0f172a;border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);color:#e2e8f0}
            .leaflet-popup-tip{background:#0f172a}
            .leaflet-popup-content{margin:10px 14px;font-size:12px;line-height:1.55}
            .leaflet-container a.leaflet-popup-close-button{color:#64748b}
            .leaflet-container{font-family:inherit}
          `;
          document.head.appendChild(s);
        }

        /* Leaflet JS */
        await new Promise<void>(resolve => {
          if ((window as unknown as Record<string, unknown>).L) { resolve(); return; }
          if (document.getElementById('leaflet-js')) {
            const poll = setInterval(() => {
              if ((window as unknown as Record<string, unknown>).L) { clearInterval(poll); resolve(); }
            }, 100);
            return;
          }
          const sc = document.createElement('script');
          sc.id = 'leaflet-js';
          sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          sc.onload = () => resolve();
          document.head.appendChild(sc);
        });

        if (cancelled || !mapDivRef.current) return;

        // 기존 인스턴스 정리
        if (mapRef.current) {
          (mapRef.current as { remove(): void }).remove();
          mapRef.current = null;
        }

        const L = (window as unknown as Record<string, unknown>).L as {
          map(el: HTMLElement, opts: unknown): unknown;
          tileLayer(url: string, opts: unknown): { addTo(m: unknown): void };
          circleMarker(ll: [number, number], opts: unknown): { addTo(m: unknown): { bindPopup(html: string): void } };
        };

        const map = L.map(mapDivRef.current, {
          center: [36.5, 127.8], zoom: 7,
          zoomControl: true, attributionControl: false,
        });

        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { subdomains: 'abcd', maxZoom: 19 },
        ).addTo(map);

        mapRef.current = map;

        let plotted = 0;
        for (const row of rows) {
          const base = resolveCoords(row.region, row.address);
          if (!base) continue;
          plotted++;

          const addr = row.address ?? '';
          let dLat = 0, dLon = 0;
          for (const { pattern, d } of CITY_OFFSET) {
            if (pattern.test(addr)) { dLat = d[0]; dLon = d[1]; break; }
          }

          /* 같은 지역 내 분산 지터 (고객명 해시 기반, 안정적) */
          const seed = row.customer_name;
          const h = hashStr(seed);
          const jLat = dLat + ((h & 0xFFFF) / 0xFFFF - 0.5) * 0.12;
          const jLon = dLon + (((h >> 16) & 0xFFFF) / 0xFFFF - 0.5) * 0.12;

          const color = colorOf(row.manager);
          L.circleMarker([base[0] + jLat, base[1] + jLon], {
            radius: 5, fillColor: color,
            color: 'rgba(0,0,0,0.3)', weight: 1,
            opacity: 1, fillOpacity: 0.85,
          }).addTo(map).bindPopup(
            `<strong>${row.customer_name}</strong><br/>` +
            `${row.region ?? ''}` +
            `${addr ? `<br/><span style="color:#94a3b8;font-size:11px">${addr}</span>` : ''}` +
            `<br/><span style="color:${color};font-weight:700">${row.manager}</span>`,
          );
        }

        console.log(`[CustomerMap] ${plotted}/${rows.length}개 점 표시`);
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (!cancelled) setStatus('error');
        console.error('[CustomerMap]', e);
      }
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{
      position: 'relative', borderRadius: '14px', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.85)',
          color: '#64748b', fontSize: '0.85rem', gap: '0.5rem',
        }}>
          <span>⟳</span> 지도 불러오는 중…
        </div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.85)', color: '#f87171', fontSize: '0.82rem',
        }}>
          지도 로드 실패
        </div>
      )}
      <div ref={mapDivRef} style={{ height: '420px', width: '100%' }} />
    </div>
  );
}
