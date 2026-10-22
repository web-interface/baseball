// 엠블럼 확인판 — #/club-select?debug=emblems (개발용: 16·20·24·32·48·96px, 밝은/어두운 바탕, 예전 그림과 비교)
import { ClubEmblem, ClubCrest } from '../../art/emblems';
import { Emblem } from '../../ui';
import { TEAMS } from '../../game/mock';

const SIZES = [16, 20, 24, 32, 48, 72];

export function EmblemSheet() {
  return (
    <div style={{ padding: '16px var(--gutter) 40px', display: 'grid', gap: 18 }}>
      {[{ bg: 'var(--bg)', label: '바탕' }, { bg: '#F4F3EF', label: '밝은 종이' }, { bg: '#070C16', label: '밤' }, { bg: '#0B0E12', label: '중계 헤더', edge: 'rgba(243,241,236,.5)' }].map((b) => (
        <div key={b.label} style={{ background: b.bg, padding: 10, borderRadius: 4, boxShadow: '0 0 0 1px var(--line)', ...(b.edge ? { ['--emblem-edge' as string]: b.edge } : {}) }}>
          {TEAMS.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, height: b.label === '바탕' ? 80 : 34 }}>
              {(b.label === '바탕' ? SIZES : [16, 24, 32]).map((sz) => <ClubEmblem key={sz} team={t} size={sz} />)}
              {b.label === '바탕' && <span style={{ marginLeft: 'auto', opacity: .5, display: 'flex', gap: 6 }}><Emblem team={t} size={24} /><Emblem team={t} size={48} /></span>}
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        {TEAMS.slice(0, 4).map((t) => <ClubCrest key={t.id} team={t} size={72} />)}
      </div>
    </div>
  );
}
