'use client';

import { useEffect, useRef, useState } from 'react';

/* ── 주소 패턴 → 좌표 (특수→일반 순, 상위 매칭 우선) ── */
const ADDR_PATTERNS: Array<[RegExp, [number, number]]> = [
  // ── 서울 ──
  [/강남구/, [37.5172, 127.0473]],
  [/강동구/, [37.5301, 127.1238]],
  [/강북구/, [37.6396, 127.0255]],
  [/서울.{0,5}강서|강서구.{0,5}서울/, [37.5509, 126.8497]],
  [/관악구/, [37.4784, 126.9516]],
  [/광진구/, [37.5385, 127.0823]],
  [/구로구/, [37.4954, 126.8874]],
  [/금천구/, [37.4569, 126.8955]],
  [/노원구/, [37.6547, 127.0566]],
  [/도봉구/, [37.6688, 127.0471]],
  [/동대문구/, [37.5744, 127.0395]],
  [/동작구/, [37.5124, 126.9393]],
  [/마포구/, [37.5638, 126.9084]],
  [/서대문구/, [37.5791, 126.9368]],
  [/서초구/, [37.4837, 127.0324]],
  [/성동구/, [37.5633, 127.0370]],
  [/성북구/, [37.5894, 127.0167]],
  [/송파구/, [37.5145, 127.1059]],
  [/양천구/, [37.5169, 126.8664]],
  [/영등포구/, [37.5264, 126.8963]],
  [/용산구/, [37.5324, 126.9904]],
  [/은평구/, [37.6026, 126.9291]],
  [/종로구/, [37.5730, 126.9794]],
  [/서울.{0,5}중구|중구.{0,5}서울/, [37.5640, 126.9975]],
  [/중랑구/, [37.6063, 127.0925]],
  [/서울/, [37.5665, 126.9780]],

  // ── 경기 ──
  [/수원/, [37.2636, 127.0286]],
  [/성남/, [37.4497, 127.1319]],
  [/고양|일산/, [37.6584, 126.8320]],
  [/부천/, [37.5034, 126.7660]],
  [/용인/, [37.2410, 127.1774]],
  [/안양/, [37.3943, 126.9568]],
  [/안산/, [37.3218, 126.8309]],
  [/남양주/, [37.6360, 127.2163]],
  [/화성/, [37.1996, 126.8317]],
  [/평택/, [36.9922, 127.1128]],
  [/의정부/, [37.7381, 127.0344]],
  [/시흥/, [37.3800, 126.8030]],
  [/파주/, [37.7599, 126.7800]],
  [/김포/, [37.6154, 126.7157]],
  [/광명/, [37.4785, 126.8643]],
  [/군포/, [37.3615, 126.9352]],
  [/경기.{0,5}광주|광주.{0,5}경기/, [37.4296, 127.2559]],
  [/이천/, [37.2721, 127.4344]],
  [/양주/, [37.7851, 127.0461]],
  [/오산/, [37.1499, 127.0779]],
  [/구리/, [37.5943, 127.1296]],
  [/안성/, [37.0079, 127.2798]],
  [/하남/, [37.5397, 127.2145]],
  [/여주/, [37.2981, 127.6374]],
  [/의왕/, [37.3448, 126.9688]],
  [/포천/, [37.8946, 127.2004]],
  [/동두천/, [37.9034, 127.0605]],
  [/양평/, [37.4916, 127.4877]],
  [/가평/, [37.8316, 127.5112]],
  [/연천/, [38.0965, 127.0742]],
  [/경기/, [37.4138, 127.5183]],

  // ── 인천 ──
  [/부평/, [37.5072, 126.7236]],
  [/남동구/, [37.4467, 126.7358]],
  [/계양/, [37.5367, 126.7378]],
  [/인천.{0,5}서구|서구.{0,5}인천/, [37.5450, 126.6760]],
  [/미추홀|인천.{0,5}남구|남구.{0,5}인천/, [37.4638, 126.6508]],
  [/연수/, [37.4103, 126.6789]],
  [/인천.{0,5}중구|중구.{0,5}인천/, [37.4742, 126.6216]],
  [/강화/, [37.7479, 126.4878]],
  [/인천/, [37.4563, 126.7052]],

  // ── 부산 ──
  [/해운대/, [35.1631, 129.1635]],
  [/사하구/, [35.1042, 128.9747]],
  [/금정/, [35.2429, 129.0917]],
  [/부산진/, [35.1660, 129.0531]],
  [/동래/, [35.2055, 129.0845]],
  [/수영/, [35.1454, 129.1134]],
  [/연제/, [35.1768, 129.0814]],
  [/사상/, [35.1499, 128.9923]],
  [/기장/, [35.2447, 129.2222]],
  [/영도/, [35.0910, 129.0677]],
  [/부산.{0,5}남구|남구.{0,5}부산/, [35.1363, 129.0846]],
  [/부산.{0,5}북구|북구.{0,5}부산/, [35.1975, 128.9909]],
  [/부산.{0,5}동구|동구.{0,5}부산/, [35.1361, 129.0521]],
  [/부산.{0,5}서구|서구.{0,5}부산/, [35.0975, 129.0249]],
  [/부산.{0,5}중구|중구.{0,5}부산/, [35.1066, 129.0320]],
  [/부산.{0,5}강서|강서.{0,5}부산/, [35.2122, 128.9815]],
  [/부산/, [35.1796, 129.0756]],

  // ── 대구 ──
  [/달서/, [35.8296, 128.5326]],
  [/달성/, [35.7749, 128.4313]],
  [/수성/, [35.8580, 128.6311]],
  [/대구.{0,5}동구|동구.{0,5}대구/, [35.8869, 128.6353]],
  [/대구.{0,5}서구|서구.{0,5}대구/, [35.8714, 128.5591]],
  [/대구.{0,5}남구|남구.{0,5}대구/, [35.8465, 128.5975]],
  [/대구.{0,5}북구|북구.{0,5}대구/, [35.8853, 128.5822]],
  [/대구.{0,5}중구|중구.{0,5}대구/, [35.8714, 128.6014]],
  [/대구/, [35.8714, 128.6014]],

  // ── 광주 ──
  [/광산/, [35.1395, 126.7934]],
  [/광주.{0,5}서구|서구.{0,5}광주/, [35.1518, 126.8895]],
  [/광주.{0,5}남구|남구.{0,5}광주/, [35.1327, 126.9019]],
  [/광주.{0,5}북구|북구.{0,5}광주/, [35.1747, 126.9121]],
  [/광주.{0,5}동구|동구.{0,5}광주/, [35.1457, 126.9238]],
  [/광주/, [35.1595, 126.8526]],

  // ── 대전 ──
  [/유성/, [36.3624, 127.3561]],
  [/대전.{0,5}서구|서구.{0,5}대전/, [36.3553, 127.3833]],
  [/대덕/, [36.3463, 127.4149]],
  [/대전.{0,5}동구|동구.{0,5}대전/, [36.3120, 127.4546]],
  [/대전.{0,5}중구|중구.{0,5}대전/, [36.3254, 127.4211]],
  [/대전/, [36.3504, 127.3845]],

  // ── 울산 ──
  [/울주/, [35.5225, 129.2408]],
  [/울산.{0,5}남구|남구.{0,5}울산/, [35.5384, 129.3114]],
  [/울산.{0,5}북구|북구.{0,5}울산/, [35.5810, 129.3606]],
  [/울산.{0,5}동구|동구.{0,5}울산/, [35.5010, 129.4175]],
  [/울산.{0,5}중구|중구.{0,5}울산/, [35.5677, 129.3324]],
  [/울산/, [35.5384, 129.3114]],

  // ── 세종 ──
  [/세종/, [36.4800, 127.2890]],

  // ── 충북 ──
  [/청주/, [36.6357, 127.4912]],
  [/충주/, [36.9910, 127.9259]],
  [/제천/, [37.1324, 128.1909]],
  [/음성/, [36.9402, 127.6901]],
  [/진천/, [36.8553, 127.4356]],
  [/보은/, [36.4895, 127.7294]],
  [/옥천/, [36.3063, 127.5707]],
  [/영동/, [36.1751, 127.7833]],
  [/충북/, [36.6357, 127.4912]],

  // ── 충남 ──
  [/천안/, [36.8151, 127.1139]],
  [/아산/, [36.7898, 127.0022]],
  [/서산/, [36.7845, 126.4503]],
  [/논산/, [36.1875, 127.0989]],
  [/당진/, [36.8892, 126.6450]],
  [/공주/, [36.4466, 127.1191]],
  [/보령/, [36.3334, 126.6128]],
  [/부여/, [36.2752, 126.9097]],
  [/홍성/, [36.6014, 126.6604]],
  [/예산/, [36.6804, 126.8490]],
  [/태안/, [36.7456, 126.2978]],
  [/충남/, [36.5184, 126.8000]],

  // ── 전북 ──
  [/전주/, [35.8242, 127.1480]],
  [/익산/, [35.9483, 126.9576]],
  [/군산/, [35.9677, 126.7363]],
  [/정읍/, [35.5701, 126.8561]],
  [/남원/, [35.4161, 127.3900]],
  [/김제/, [35.8035, 126.8807]],
  [/완주/, [35.9043, 127.1619]],
  [/전북/, [35.7175, 127.1530]],

  // ── 전남 ──
  [/목포/, [34.8118, 126.3922]],
  [/여수/, [34.7604, 127.6622]],
  [/순천/, [34.9506, 127.4871]],
  [/나주/, [35.0160, 126.7108]],
  [/광양/, [34.9408, 127.6956]],
  [/화순/, [35.0643, 126.9864]],
  [/해남/, [34.5735, 126.5990]],
  [/영암/, [34.8001, 126.6964]],
  [/무안/, [34.9903, 126.4812]],
  [/영광/, [35.2771, 126.5124]],
  [/완도/, [34.3100, 126.7551]],
  [/전남/, [34.8679, 126.9910]],

  // ── 경북 ──
  [/포항/, [35.9909, 129.5194]],
  [/경주/, [35.8562, 129.2247]],
  [/김천/, [36.1398, 128.1135]],
  [/안동/, [36.5684, 128.7294]],
  [/구미/, [36.1194, 128.3443]],
  [/영주/, [36.8057, 128.6243]],
  [/영천/, [35.9731, 128.9375]],
  [/상주/, [36.4109, 128.1590]],
  [/문경/, [36.5866, 128.1869]],
  [/경산/, [35.8252, 128.7409]],
  [/경북/, [36.4919, 128.8889]],

  // ── 경남 ──
  [/창원/, [35.2280, 128.6811]],
  [/진주/, [35.1798, 128.1076]],
  [/통영/, [34.8544, 128.4335]],
  [/사천/, [35.0038, 128.0648]],
  [/김해/, [35.2285, 128.8892]],
  [/밀양/, [35.5040, 128.7462]],
  [/거제/, [34.8800, 128.6211]],
  [/양산/, [35.3351, 129.0358]],
  [/함안/, [35.2726, 128.4065]],
  [/거창/, [35.6869, 127.9093]],
  [/합천/, [35.5665, 128.1655]],
  [/경남/, [35.4606, 128.2132]],

  // ── 강원 ──
  [/춘천/, [37.8813, 127.7298]],
  [/원주/, [37.3420, 127.9202]],
  [/강릉/, [37.7519, 128.8760]],
  [/동해/, [37.5247, 129.1142]],
  [/속초/, [38.2069, 128.5918]],
  [/삼척/, [37.4499, 129.1658]],
  [/홍천/, [37.6969, 127.8882]],
  [/철원/, [38.1463, 127.3136]],
  [/양양/, [38.0757, 128.6180]],
  [/강원/, [37.8228, 128.1555]],

  // ── 제주 ──
  [/제주시/, [33.5097, 126.5219]],
  [/서귀포/, [33.2541, 126.5600]],
  [/제주/, [33.4996, 126.5312]],
];

const COLORS = [
  '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#67e8f9',
  '#c4b5fd', '#86efac', '#fde68a', '#fb923c', '#60a5fa',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/* 주소 문자열에서 시군구 수준 좌표 반환 */
function resolveCoords(region: string | null, address: string | null): [number, number] | null {
  const text = [region, address].filter(Boolean).join(' ');
  if (!text) return null;
  for (const [pattern, coords] of ADDR_PATTERNS) {
    if (pattern.test(text)) return coords;
  }
  return null;
}

type MapRow = { manager: string; region: string | null; customer_name: string; address: string | null };
type Props = { managerOrder?: string[] };

export default function CustomerMap({ managerOrder }: Props) {
  const mapDivRef       = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<unknown>(null);
  const managerOrderRef = useRef(managerOrder);
  managerOrderRef.current = managerOrder;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch('/api/customers/map');
        if (!res.ok) throw new Error('데이터 로드 실패');
        const rows: MapRow[] = await res.json();
        if (cancelled) return;

        /* 담당자별 색상 — 테이블과 동일한 순위 순서 사용 */
        const order = managerOrderRef.current;
        let rankList: string[];
        if (order && order.length > 0) {
          rankList = order;
        } else {
          const countMap = new Map<string, number>();
          for (const r of rows) countMap.set(r.manager, (countMap.get(r.manager) ?? 0) + 1);
          rankList = [...countMap.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
        }
        const colorOf = (m: string) => COLORS[rankList.indexOf(m) % COLORS.length] ?? '#94a3b8';

        /* Leaflet CSS */
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css'; link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        /* 다크 테마 팝업 */
        if (!document.getElementById('leaflet-dark-css')) {
          const s = document.createElement('style');
          s.id = 'leaflet-dark-css';
          s.textContent = [
            '.leaflet-popup-content-wrapper{background:#0f172a;border:1px solid rgba(255,255,255,0.12);',
            'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);color:#e2e8f0}',
            '.leaflet-popup-tip{background:#0f172a}',
            '.leaflet-popup-content{margin:10px 14px;font-size:12px;line-height:1.6}',
            '.leaflet-container a.leaflet-popup-close-button{color:#64748b}',
          ].join('');
          document.head.appendChild(s);
        }

        /* Leaflet JS */
        await new Promise<void>(resolve => {
          if ((window as unknown as Record<string, unknown>).L) { resolve(); return; }
          if (document.getElementById('leaflet-js')) {
            const t = setInterval(() => {
              if ((window as unknown as Record<string, unknown>).L) { clearInterval(t); resolve(); }
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

        if (mapRef.current) { (mapRef.current as { remove(): void }).remove(); mapRef.current = null; }

        const L = (window as unknown as Record<string, unknown>).L as {
          map(el: HTMLElement, opts: unknown): unknown;
          tileLayer(url: string, opts: unknown): { addTo(m: unknown): void };
          circleMarker(ll: [number, number], opts: unknown): { addTo(m: unknown): { bindPopup(h: string): void } };
        };

        const map = L.map(mapDivRef.current, {
          center: [36.5, 127.8], zoom: 7,
          zoomControl: true, attributionControl: false,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd', maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;

        let plotted = 0;
        for (const row of rows) {
          const base = resolveCoords(row.region, row.address);
          if (!base) continue;
          plotted++;

          /* 같은 도시 내 미세 분산 (±약 1~2km) */
          const h = hashStr(row.customer_name || '');
          const jLat = ((h & 0xFFFF) / 0xFFFF - 0.5) * 0.025;
          const jLon = (((h >> 16) & 0xFFFF) / 0xFFFF - 0.5) * 0.025;

          const color = colorOf(row.manager);
          L.circleMarker([base[0] + jLat, base[1] + jLon], {
            radius: 5, fillColor: color,
            color: 'rgba(0,0,0,0.3)', weight: 1,
            opacity: 1, fillOpacity: 0.85,
          }).addTo(map).bindPopup(
            `<strong>${row.customer_name}</strong><br/>` +
            (row.address ? `<span style="color:#94a3b8;font-size:11px">${row.address}</span><br/>` : '') +
            `<span style="color:${color};font-weight:700">${row.manager}</span>`,
          );
        }

        console.log(`[CustomerMap] ${plotted}/${rows.length}개 점 표시`);
        if (!cancelled) setStatus('ready');
      } catch (e) {
        console.error('[CustomerMap]', e);
        if (!cancelled) setStatus('error');
      }
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) { (mapRef.current as { remove(): void }).remove(); mapRef.current = null; }
    };
  }, []);

  return (
    <div style={{
      position: 'relative', borderRadius: '14px', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.85)', color: '#64748b', fontSize: '0.85rem', gap: '0.4rem',
        }}>
          ⟳ 지도 불러오는 중…
        </div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.85)', color: '#f87171', fontSize: '0.82rem',
        }}>
          지도 로드 실패
        </div>
      )}
      <div ref={mapDivRef} style={{ height: '420px', width: '100%' }} />
    </div>
  );
}
