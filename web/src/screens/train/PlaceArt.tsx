// 훈련 장소 그림 — 장소마다 다른 풍경 (160×90 판, 그라디언트 + 단순한 도형만). 그림 안 색은 풍경 고유색이라 토큰을 쓰지 않는다
// (로그인 화면 StadiumArt 와 같은 예외). classic 테마는 Train.module.css 가 먹 + 내 구단 별색으로 눌러 찍는다.
import { memo, useId, type ReactNode } from 'react';
import type { PlaceId } from '../../game/training';

const W = 160, H = 90;

/** 세로 그라디언트 */
function VGrad({ id, stops }: { id: string; stops: [number, string, number?][] }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />)}
    </linearGradient>
  );
}
/** 둥근 빛 */
function Glow({ id, color, a = 0.6 }: { id: string; color: string; a?: number }) {
  return (
    <radialGradient id={id} cx=".5" cy=".5" r=".5">
      <stop offset="0" stopColor={color} stopOpacity={a} />
      <stop offset=".45" stopColor={color} stopOpacity={a * 0.35} />
      <stop offset="1" stopColor={color} stopOpacity={0} />
    </radialGradient>
  );
}
const balls = (pts: [number, number, number?][], fill = '#F6F3EC') => pts.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r ?? 1.3} fill={fill} />);

/** 피칭 머신 — 세 발 받침 · 바퀴 하나 달린 몸통 · 공 통(주황)과 미끄럼 길. (x, y) = 몸통 가운데 */
function Machine({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <path d="M0 6L-7 16M0 6L7 16M0 6V16" stroke="#0E131B" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <rect x="-7" y="-2.5" width="14" height="9" rx="2" fill="#3E4A5D" />
      <circle cx="0" cy="2" r="3.5" fill="#C3CCD8" />
      <circle cx="0" cy="2" r="1.1" fill="#3E4A5D" />
      <path d="M4 -2.5L8.5 -9" stroke="#8D99AC" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 -15H16L13 -9H7Z" fill="#E0662B" />
      {balls([[7.3, -15.8, 1.25], [10, -16.2, 1.25], [12.7, -15.8, 1.25]])}
    </g>
  );
}

/* ───────── 장소마다 ───────── */
type Scene = (u: (k: string) => string) => ReactNode;

const SCENES: Record<PlaceId, Scene> = {
  /** 구단 실내 연습장 — 천장 조명 띠 · 그물 벽 · 인조잔디 · 피칭 머신 */
  club: (u) => (
    <>
      <defs>
        <VGrad id={u('w')} stops={[[0, '#141B27'], [1, '#232E3F']]} />
        <VGrad id={u('f')} stops={[[0, '#2C7444'], [1, '#17482B']]} />
        <Glow id={u('l')} color="#FFF1D6" a={0.5} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('w')})`} />
      <rect width={W} height="16" fill="#0B1019" />
      {[22, 66, 110].map((x) => <g key={x}><ellipse cx={x + 14} cy="16" rx="30" ry="14" fill={`url(#${u('l')})`} /><rect x={x} y="6" width="28" height="3" rx="1" fill="#FFF4DC" /></g>)}
      <g stroke="#55647C" strokeWidth=".5" opacity=".55">
        {Array.from({ length: 21 }, (_, i) => <line key={'v' + i} x1={i * 8} y1="16" x2={i * 8} y2="60" />)}
        {Array.from({ length: 7 }, (_, i) => <line key={'h' + i} x1="0" y1={18 + i * 7} x2={W} y2={18 + i * 7} />)}
      </g>
      <path d={`M0 60H${W}V${H}H0Z`} fill={`url(#${u('f')})`} />
      <path d="M58 60L48 90H66L68 60ZM92 60L94 90H112L102 60Z" fill="#FFFFFF" opacity=".05" />
      <Machine x={80} y={48} />
      <path d="M74 83h12v3l-6 3-6-3Z" fill="#F4F1EA" opacity=".9" />
      {balls([[86, 66, 1.6], [70, 74, 2], [120, 84, 1.8], [36, 80, 1.6]])}
    </>
  ),

  /** 퓨처스 구장 — 낮 하늘 · 낮은 언덕 · 나무 관중석 · 작은 내야 */
  futures: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#8FC6EA'], [1, '#E3F1F8']]} />
        <VGrad id={u('g')} stops={[[0, '#5AA45B'], [1, '#3B7F42']]} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      <ellipse cx="128" cy="16" rx="18" ry="4" fill="#FFFFFF" opacity=".7" />
      <ellipse cx="40" cy="12" rx="14" ry="3" fill="#FFFFFF" opacity=".6" />
      <path d="M0 44C20 34 38 36 56 42S96 34 120 40 150 36 160 38V52H0Z" fill="#7FA88A" />
      <path d="M0 48C30 42 60 46 90 44S140 42 160 46V54H0Z" fill="#5E8C6C" />
      <g fill="#8A6A48">
        <rect x="6" y="40" width="40" height="4" /><rect x="10" y="36" width="32" height="4" fill="#9C7B56" /><rect x="14" y="32" width="24" height="4" />
      </g>
      <rect x="118" y="30" width="26" height="12" fill="#2C3A2F" /><rect x="121" y="33" width="20" height="2" fill="#E9E3C8" opacity=".7" /><rect x="130" y="42" width="2" height="10" fill="#2C3A2F" />
      <rect x="0" y="51" width={W} height="4" fill="#2E5B3D" /><rect x="0" y="51" width={W} height="1" fill="#E7C44C" />
      <rect x="0" y="55" width={W} height="35" fill={`url(#${u('g')})`} />
      <path d="M80 60L124 75L80 93L36 75Z" fill="#C48B5A" />
      <path d="M80 66L110 75L80 87L50 75Z" fill="#4E9A52" />
      <g fill="#F4F1EA"><rect x="122" y="73.5" width="3.4" height="2.4" /><rect x="78.3" y="59" width="3.4" height="2.4" /><rect x="34.6" y="73.5" width="3.4" height="2.4" /></g>
      <ellipse cx="80" cy="76" rx="5" ry="2" fill="#C48B5A" />
    </>
  ),

  /** 배팅 케이지 — 그물 터널 원근 · 끝에 피칭 머신 · 날아오는 공 */
  cage: (u) => (
    <>
      <defs>
        <VGrad id={u('f')} stops={[[0, '#1E5434'], [1, '#2B7346']]} />
        <Glow id={u('l')} color="#FFF0D0" a={0.55} />
      </defs>
      <rect width={W} height={H} fill="#0C1118" />
      <path d="M0 0H160L102 30H58Z" fill="#111823" />
      <path d="M0 0L58 30V56L0 90Z" fill="#141C28" />
      <path d="M160 0L102 30V56L160 90Z" fill="#141C28" />
      <path d="M0 90L58 56H102L160 90Z" fill={`url(#${u('f')})`} />
      <rect x="58" y="30" width="44" height="26" fill="#0A0E14" />
      <ellipse cx="80" cy="31" rx="26" ry="8" fill={`url(#${u('l')})`} />
      <line x1="66" y1="31" x2="94" y2="31" stroke="#FFF3D6" strokeWidth="1.2" strokeLinecap="round" />
      <g stroke="#3B485D" strokeWidth=".5" opacity=".9">
        {[0.15, 0.32, 0.5, 0.68, 0.85].map((t) => <g key={t}>
          <line x1={0} y1={t * 90} x2={58} y2={30 + t * 26} />
          <line x1={160} y1={t * 90} x2={102} y2={30 + t * 26} />
          <line x1={t * 160} y1={0} x2={58 + t * 44} y2={30} />
        </g>)}
        {[0.25, 0.5, 0.75].map((t) => <g key={'r' + t}>
          <rect x={58 * t} y={30 * t} width={160 - 116 * t} height={90 - 64 * t} fill="none" />
        </g>)}
      </g>
      <Machine x={80} y={44} k={0.62} />
      <g stroke="#F6F3EC" strokeLinecap="round" opacity=".28">
        <line x1="82" y1="49" x2="86" y2="55" strokeWidth=".8" /><line x1="88" y1="59" x2="94" y2="67" strokeWidth="1.4" /><line x1="98" y1="72" x2="106" y2="82" strokeWidth="2.2" />
      </g>
      {balls([[86.5, 55.5, 1], [94.5, 67.5, 1.8], [107, 83, 3]])}
    </>
  ),

  /** 웨이트 센터 — 콘크리트 벽 · 거울 띠 · 스쿼트 랙 · 바벨 원판 · 덤벨 줄 */
  weight: (u) => (
    <>
      <defs>
        <VGrad id={u('w')} stops={[[0, '#2C323C'], [1, '#1B1F26']]} />
        <VGrad id={u('m')} stops={[[0, '#3E4A5A'], [1, '#2B3442']]} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('w')})`} />
      <rect y="0" width={W} height="5" fill="#101318" />
      <rect x="10" y="2" width="40" height="1.6" rx=".8" fill="#E9EEF5" opacity=".8" /><rect x="110" y="2" width="40" height="1.6" rx=".8" fill="#E9EEF5" opacity=".8" />
      <rect x="0" y="16" width={W} height="34" fill={`url(#${u('m')})`} />
      <path d="M20 16L6 50H14L28 16ZM120 16L106 50H110L124 16Z" fill="#B7C9DC" opacity=".14" />
      <rect x="0" y="66" width={W} height="24" fill="#111316" />
      <g stroke="#23272E" strokeWidth=".6">{[72, 78, 84].map((y) => <line key={y} x1="0" y1={y} x2={W} y2={y} />)}</g>
      <g fill="#4B525C"><rect x="46" y="20" width="4" height="50" /><rect x="110" y="20" width="4" height="50" /><rect x="44" y="20" width="72" height="3" /></g>
      <line x1="22" y1="47" x2="138" y2="47" stroke="#CFD5DD" strokeWidth="2" strokeLinecap="round" />
      <g>
        <rect x="28" y="31" width="6" height="32" rx="1.2" fill="#C43B33" /><rect x="34" y="35" width="4" height="24" rx="1" fill="#2D5DA6" /><rect x="38" y="44" width="2.4" height="6" fill="#9AA3AE" />
        <rect x="126" y="31" width="6" height="32" rx="1.2" fill="#C43B33" /><rect x="122" y="35" width="4" height="24" rx="1" fill="#2D5DA6" /><rect x="119.6" y="44" width="2.4" height="6" fill="#9AA3AE" />
      </g>
      <rect x="20" y="74" width="120" height="5" rx="1" fill="#383D45" />
      {Array.from({ length: 8 }, (_, i) => <g key={i} fill="#1E2228"><circle cx={30 + i * 14} cy="73" r="2.6" /><circle cx={36 + i * 14} cy="73" r="2.6" /><rect x={30 + i * 14} y="72.3" width="6" height="1.4" fill="#7A828D" /></g>)}
    </>
  ),

  /** 불펜 피칭장 — 저녁 하늘 · 외야 담장 · 마운드 둘 · 홈플레이트 */
  bullpen: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#2E3B5A'], [0.7, '#B9785E'], [1, '#E7A06A']]} />
        <VGrad id={u('g')} stops={[[0, '#2F7440'], [1, '#3F8E4E']]} />
      </defs>
      <rect width={W} height="40" fill={`url(#${u('s')})`} />
      <path d="M104 26L160 20V34L104 36Z" fill="#18202C" /><rect x="104" y="35" width="56" height="2" fill="#0F151E" />
      <rect x="0" y="36" width={W} height="15" fill="#22463A" />
      <g stroke="#1A372D" strokeWidth=".6">{Array.from({ length: 16 }, (_, i) => <line key={i} x1={i * 10 + 5} y1="36" x2={i * 10 + 5} y2="51" />)}</g>
      <rect x="0" y="36" width={W} height="1.2" fill="#E7C44C" />
      <rect x="0" y="51" width={W} height="39" fill={`url(#${u('g')})`} />
      {[46, 114].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="64" rx="25" ry="7.5" fill="#B98458" />
          <ellipse cx={x} cy="63" rx="17" ry="4.5" fill="#C99464" />
          <rect x={x - 3.5} y="61.6" width="7" height="1.4" fill="#F4F1EA" />
          <ellipse cx={x} cy="84" rx="12" ry="3.6" fill="#B98458" />
          <path d={`M${x - 3} 82.4h6v1.6l-3 1.6-3-1.6Z`} fill="#F4F1EA" />
        </g>
      ))}
      <line x1="115" y1="66" x2="114.4" y2="79" stroke="#F6F3EC" strokeWidth="1" strokeLinecap="round" opacity=".3" />
      {balls([[114.3, 80, 1.3]])}
    </>
  ),

  /** 스피드 트랙 — 붉은 트랙 레인 원근 · 결승선 체크 · 먼 관중석 */
  track: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#8CC9E8'], [1, '#D8EEF7']]} />
        <VGrad id={u('t')} stops={[[0, '#A9442F'], [1, '#CC5B40']]} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      <rect x="0" y="26" width={W} height="14" fill="#5B6B7F" />
      <g stroke="#7F90A5" strokeWidth=".6">{[29, 32, 35].map((y) => <line key={y} x1="0" y1={y} x2={W} y2={y} />)}</g>
      <rect x="0" y="40" width={W} height="10" fill="#4C9A56" />
      <path d={`M0 50H${W}V${H}H0Z`} fill={`url(#${u('t')})`} />
      <g stroke="#F6F3EC" strokeWidth=".8" opacity=".9">
        {[-120, -60, 0, 60, 120, 180, 240, 300].map((x) => <line key={x} x1={80 + (x - 80) * 0.18} y1="50" x2={x} y2={H} />)}
      </g>
      <g>
        {Array.from({ length: 24 }, (_, i) => {
          const y = 62 + (i % 2) * 2.2;
          return <rect key={i} x={-4 + Math.floor(i / 2) * 14 + (i % 2) * 7} y={y} width="7" height="2.2" fill={i % 4 < 2 ? '#F6F3EC' : '#1A1D22'} opacity=".9" />;
        })}
      </g>
      <g fill="#20242B"><rect x="30" y="80" width="10" height="3" rx="1" /><rect x="88" y="80" width="10" height="3" rx="1" /></g>
    </>
  ),

  /** 펑고 훈련장 — 내야 흙 · 흩어진 공 · 공 바구니 · 펑고 배트 */
  fungo: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#A5D2EE'], [1, '#F1E6C6']]} />
        <VGrad id={u('d')} stops={[[0, '#B97E50'], [1, '#CD9465']]} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      <rect x="0" y="30" width={W} height="5" fill="#295B40" /><rect x="0" y="30" width={W} height="1" fill="#E7C44C" />
      <rect x="0" y="35" width={W} height="25" fill="#4E9A54" />
      <g fill="#FFFFFF" opacity=".06">{[0, 40, 80, 120].map((x) => <rect key={x} x={x} y="35" width="20" height="25" />)}</g>
      <path d="M-10 92C20 58 60 50 80 50S140 58 170 92Z" fill={`url(#${u('d')})`} />
      <ellipse cx="80" cy="98" rx="52" ry="26" fill="#4E9A54" />
      {balls([[34, 70], [48, 62, 1.1], [62, 58, 1], [92, 57, 1], [104, 61, 1.1], [118, 66], [128, 74, 1.5], [24, 80, 1.5], [70, 66, 1.1], [140, 84, 1.6]])}
      <path d="M126 86L130 76H144L148 86Z" fill="#5C6570" />
      {balls([[132, 75, 1.6], [136, 74.4, 1.6], [140, 75, 1.6], [134, 72.6, 1.5], [138, 72.6, 1.5]])}
      <line x1="16" y1="88" x2="40" y2="62" stroke="#C49A63" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16.5" cy="87.5" r="1.8" fill="#8E6A3D" />
    </>
  ),

  /** 전력분석실 — 어두운 방 · 큰 화면(그래프 · 투구 위치) · 노트북 빛 */
  video: (u) => (
    <>
      <defs>
        <VGrad id={u('b')} stops={[[0, '#0A0F17'], [1, '#141C29']]} />
        <Glow id={u('g')} color="#4FB3F0" a={0.32} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('b')})`} />
      <ellipse cx="80" cy="44" rx="78" ry="40" fill={`url(#${u('g')})`} />
      <rect x="20" y="10" width="120" height="50" rx="2" fill="#0E2235" stroke="#2E5378" strokeWidth="1" />
      <g stroke="#2A4867" strokeWidth=".4">{[20, 30, 40, 50].map((y) => <line key={y} x1="24" y1={y} x2="96" y2={y} />)}</g>
      <polyline points="24,48 34,42 44,45 54,34 64,37 74,26 84,30 94,20" fill="none" stroke="#4FD1C5" strokeWidth="1.4" strokeLinejoin="round" />
      <polyline points="24,52 34,50 44,46 54,48 64,42 74,44 84,38 94,40" fill="none" stroke="#FF9F5A" strokeWidth="1.1" strokeLinejoin="round" opacity=".9" />
      <rect x="104" y="18" width="28" height="34" fill="none" stroke="#9FB6CF" strokeWidth=".8" />
      <g stroke="#56708C" strokeWidth=".4"><line x1="113.3" y1="18" x2="113.3" y2="52" /><line x1="122.7" y1="18" x2="122.7" y2="52" /><line x1="104" y1="29.3" x2="132" y2="29.3" /><line x1="104" y1="40.7" x2="132" y2="40.7" /></g>
      <circle cx="109" cy="24" r="1.6" fill="#FF5A4E" /><circle cx="118" cy="35" r="1.6" fill="#FFC53D" /><circle cx="127" cy="46" r="1.6" fill="#FF5A4E" /><circle cx="126" cy="27" r="1.6" fill="#4FD1C5" /><circle cx="110" cy="47" r="1.6" fill="#4FD1C5" />
      <path d={`M0 72H${W}V${H}H0Z`} fill="#18202D" /><rect x="0" y="72" width={W} height="1" fill="#2B3647" />
      <path d="M26 72L30 64H52L56 72Z" fill="#2B3A52" /><rect x="31" y="65" width="20" height="5" fill="#3D86C8" opacity=".75" />
      <path d="M106 72L109 66H128L131 72Z" fill="#2B3A52" /><rect x="110" y="67" width="17" height="3.6" fill="#4FD1C5" opacity=".6" />
    </>
  ),

  /** 오키나와 캠프 — 바다 · 해 · 모래 · 야자수 · 바닷가 구장 */
  okinawa: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#6EBFEA'], [1, '#CDE9F6']]} />
        <VGrad id={u('w')} stops={[[0, '#1691BE'], [1, '#43C3D5']]} />
        <Glow id={u('g')} color="#FFF4C8" a={0.8} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      <circle cx="124" cy="18" r="16" fill={`url(#${u('g')})`} /><circle cx="124" cy="18" r="6.5" fill="#FFF3C4" />
      <rect x="0" y="38" width={W} height="20" fill={`url(#${u('w')})`} />
      <g stroke="#FFFFFF" strokeWidth=".7" strokeLinecap="round" opacity=".55"><line x1="18" y1="44" x2="30" y2="44" /><line x1="62" y1="48" x2="78" y2="48" /><line x1="110" y1="43" x2="122" y2="43" /><line x1="132" y1="52" x2="148" y2="52" /></g>
      <path d="M0 58C40 55 120 56 160 58V66H0Z" fill="#EAD7A7" />
      <rect x="0" y="64" width={W} height="26" fill="#4FA35A" />
      <rect x="0" y="64" width={W} height="2.4" fill="#2A6A45" />
      <path d="M96 90L128 72L160 80V90Z" fill="#C48B5A" />
      <g>
        <path d="M30 90Q25 64 40 38" fill="none" stroke="#7B5A3A" strokeWidth="3" strokeLinecap="round" />
        <g fill="#2E7A48">
          <path d="M40 38Q26 30 10 38Q26 34 40 41Z" /><path d="M40 38Q50 26 66 32Q50 31 40 41Z" />
          <path d="M40 38Q32 22 22 17Q36 26 41 38Z" /><path d="M40 38Q48 20 58 17Q46 27 41 38Z" /><path d="M40 39Q44 50 34 58Q41 48 38 40Z" />
        </g>
        <circle cx="38.5" cy="41" r="1.5" fill="#5A3D22" /><circle cx="41.6" cy="41.4" r="1.5" fill="#5A3D22" />
      </g>
      <g transform="translate(140 64) scale(.6)">
        <path d="M0 0Q-3 -22 6 -40" fill="none" stroke="#7B5A3A" strokeWidth="3" strokeLinecap="round" />
        <g fill="#2E7A48"><path d="M6 -40Q-8 -48 -22 -40Q-8 -44 6 -37Z" /><path d="M6 -40Q16 -52 30 -46Q16 -47 6 -37Z" /><path d="M6 -40Q-2 -56 -10 -60Q2 -50 7 -40Z" /></g>
      </g>
    </>
  ),

  /** 애리조나 캠프 — 마른 노을빛 하늘 · 메사 · 사와로 선인장 · 마른 잔디 */
  arizona: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#E2875C'], [0.55, '#F2B57D'], [1, '#F8DDB0']]} />
        <Glow id={u('g')} color="#FFF0C9" a={0.85} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      <circle cx="42" cy="36" r="18" fill={`url(#${u('g')})`} /><circle cx="42" cy="36" r="8" fill="#FFF1CC" />
      <path d="M0 52L8 43H30L36 52Z" fill="#C97A55" />
      <path d="M58 54L68 36H104L112 54Z" fill="#AE5536" /><path d="M68 36H104L102 39H70Z" fill="#C46A48" />
      <path d="M120 54L126 46H150L156 54Z" fill="#C97A55" />
      <rect x="0" y="52" width={W} height="14" fill="#D9A469" />
      <rect x="0" y="66" width={W} height="24" fill="#7EA157" />
      <path d="M0 90L0 74L36 90Z" fill="#C48B5A" />
      <g fill="#3F6B3D">
        <rect x="126" y="38" width="6" height="34" rx="3" />
        <rect x="118" y="48" width="5" height="12" rx="2.5" /><rect x="118" y="56" width="10" height="4.6" rx="2.3" />
        <rect x="135" y="42" width="5" height="12" rx="2.5" /><rect x="130" y="50" width="10" height="4.6" rx="2.3" />
        <rect x="20" y="56" width="3.4" height="14" rx="1.7" /><rect x="15.5" y="60" width="3" height="6" rx="1.5" /><rect x="15.5" y="64" width="6" height="2.6" rx="1.3" />
      </g>
    </>
  ),

  /** 고지대 캠프 — 눈 덮인 산 · 옅은 구름 · 산 아래 트랙과 깃발 */
  highland: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#3E6C9F'], [1, '#B9D5EC']]} />
        <VGrad id={u('m')} stops={[[0, '#8AA2BE'], [1, '#6C86A6']]} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      <ellipse cx="30" cy="14" rx="18" ry="2.6" fill="#FFFFFF" opacity=".5" /><ellipse cx="112" cy="10" rx="22" ry="2.4" fill="#FFFFFF" opacity=".42" />
      <path d="M0 54L24 26L42 42L66 14L92 42L112 28L138 48L160 36V62H0Z" fill={`url(#${u('m')})`} />
      <g fill="#EEF4FA">
        <path d="M58 23.4L66 14L74 23.4L70 21.6L66 25L62 21.6Z" /><path d="M18 33L24 26L30 33L27 31.6L24 34L21 31.6Z" /><path d="M106 34.6L112 28L118 34.6L115 33.4L112 36L109 33.4Z" />
      </g>
      <path d="M0 66L36 52L84 62L126 50L160 60V72H0Z" fill="#3E6B55" />
      <rect x="0" y="70" width={W} height="20" fill="#4E8F57" />
      <path d="M-10 90Q80 62 170 90" fill="none" stroke="#C4553E" strokeWidth="5" />
      <path d="M-10 90Q80 62 170 90" fill="none" stroke="#F6F3EC" strokeWidth=".5" strokeDasharray="3 3" opacity=".7" />
      <line x1="136" y1="46" x2="136" y2="72" stroke="#DFE6EE" strokeWidth="1" />
      <path d="M136.5 46L148 49.5L136.5 53Z" fill="#FF7A2A" />
    </>
  ),

  /** 야간 특타 — 밤하늘 · 조명탑 · 빛 고깔 · 불 켜진 타석 · 티 위의 공 */
  night: (u) => (
    <>
      <defs>
        <VGrad id={u('s')} stops={[[0, '#03060C'], [1, '#0F1D36']]} />
        <linearGradient id={u('c')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF2D2" stopOpacity=".55" /><stop offset="1" stopColor="#FFF2D2" stopOpacity="0" />
        </linearGradient>
        <Glow id={u('g')} color="#FFF6E0" a={0.9} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u('s')})`} />
      {[[70, 8], [96, 14], [128, 6], [148, 20], [112, 26], [84, 22], [56, 18]].map(([x, y]) => <circle key={x} cx={x} cy={y} r=".6" fill="#FFFFFF" opacity=".6" />)}
      <path d="M100 40L160 34V60H96Z" fill="#0A111F" />
      <g stroke="#1B2A44" strokeWidth=".6">{[44, 49, 54].map((y) => <line key={y} x1="98" y1={y} x2="160" y2={y - 4} />)}</g>
      <path d="M22 16L132 90H52Z" fill={`url(#${u('c')})`} />
      <circle cx="22" cy="12" r="18" fill={`url(#${u('g')})`} />
      <rect x="20.5" y="16" width="3" height="56" fill="#070B12" />
      <rect x="8" y="5" width="29" height="11" rx="1" fill="#1A2333" />
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={10 + (i % 5) * 5.3} y={6.6 + Math.floor(i / 5) * 4.4} width="3.8" height="3" rx=".5" fill="#FFF6E0" />)}
      <rect x="0" y="62" width={W} height="28" fill="#12371F" />
      <ellipse cx="96" cy="80" rx="36" ry="9" fill="#6E4C31" />
      <g fill="none" stroke="#F4F1EA" strokeWidth=".7" opacity=".85"><rect x="76" y="75" width="12" height="9" /><rect x="104" y="75" width="12" height="9" /></g>
      <path d="M92.5 79h7v1.8l-3.5 1.8-3.5-1.8Z" fill="#F4F1EA" />
      <line x1="96" y1="79" x2="96" y2="71.5" stroke="#2A2F38" strokeWidth="1.2" />
      {balls([[96, 70.4, 1.7]])}
    </>
  ),

  /** 레전드 아카데미 — 금빛 기둥 건물 · 위에서 비추는 두 줄기 빛 */
  academy: (u) => (
    <>
      <defs>
        <VGrad id={u('b')} stops={[[0, '#160F22'], [1, '#2B1B2E']]} />
        <VGrad id={u('c')} stops={[[0, '#F0D88E'], [1, '#B48D3E']]} />
        <linearGradient id={u('l')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4D6" stopOpacity=".4" /><stop offset="1" stopColor="#FFF4D6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u('b')})`} />
      <path d="M8 0L22 0L74 90H40Z" fill={`url(#${u('l')})`} /><path d="M138 0L152 0L120 90H86Z" fill={`url(#${u('l')})`} />
      <path d="M36 31L80 12L124 31Z" fill="#C9A24A" /><path d="M46 29L80 15.6L114 29Z" fill="#7D5D22" />
      <circle cx="80" cy="23.6" r="3.6" fill="#FFF1C4" /><circle cx="80" cy="23.6" r="5.4" fill="none" stroke="#F0D88E" strokeWidth=".8" />
      <rect x="34" y="31" width="92" height="6" fill="#DDBA62" />
      {[42, 56, 70, 84, 98, 112].map((x) => <g key={x}><rect x={x} y="37" width="6" height="36" fill={`url(#${u('c')})`} /><rect x={x} y="37" width="1.6" height="36" fill="#FFF3CC" opacity=".5" /></g>)}
      <rect x="30" y="73" width="100" height="5" fill="#B48D3E" /><rect x="24" y="78" width="112" height="5" fill="#9B7832" />
      <rect x="0" y="83" width={W} height="7" fill="#100B16" />
    </>
  ),
};

/** 장소 그림 — 판을 꽉 채운다(넘치는 쪽은 잘림) */
export const PlaceArt = memo(function PlaceArt({ id, className }: { id: PlaceId; className?: string }) {
  const base = 'pa' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (k: string) => `${base}${k}`;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {SCENES[id](u)}
    </svg>
  );
});
