import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Card, Text, Spinner, makeStyles, tokens,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from '@fluentui/react-components';

const SCORE_MODES = [
  { value: 'all', label: '显示全部成绩' },
  { value: 'best', label: '显示最好成绩' },
];
const ATTR_OPTIONS = ['全部', '必修', '限选', '任选', '公选'];

function ScoreQuery({ account }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [scores, setScores] = useState([]);
  const [terms, setTerms] = useState(['all']);
  const [selectedTerm, setSelectedTerm] = useState('all');
  const [showFullData, setShowFullData] = useState(false);

  // 新筛选
  const [attrFilter, setAttrFilter] = useState('全部');
  const [scoreMode, setScoreMode] = useState('all');
  const [showRetake, setShowRetake] = useState(true);
  const [isFetchingAll, setIsFetchingAll] = useState(false);

  // 加载缓存
  useEffect(() => {
    if (!account?.username) return;
    try {
      const raw = localStorage.getItem(`scores_cache_${account.username}`);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && Array.isArray(cached.scores) && cached.scores.length > 0) {
          setScores(cached.scores);
          const tset = new Set(cached.scores.map(s => s.term));
          const sortedTerms = Array.from(tset).sort().reverse();
          setTerms(['all', ...sortedTerms]);
          if (sortedTerms.length > 0) setSelectedTerm(sortedTerms[0]);
        }
      }
    } catch (_) {}
  }, [account?.username]);

  const fetchScores = async (fetchAll) => {
    if (!account?.username || !account?.password) { setError('账号信息不完整'); return; }
    setLoading(true); setError(''); setShowSuccess(false);
    setIsFetchingAll(!!fetchAll);
    try {
      // 策略：如果当前选中了学期就只拉该学期（快），否则拉全部
      // 用户也可以主动点"获取全部"
      const term = fetchAll ? undefined : (selectedTerm !== 'all' ? selectedTerm : undefined);
      const response = await fetch('http://localhost:5000/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: account.username, password: account.password,
          name: account.name, term
        })
      });
      if (!response.ok) { setError('网络错误，请稍后重试'); return; }
      const data = await response.json();
      if (!data.success) { setError(data.message || '获取成绩失败'); return; }
      const ts = data.data.scores.map((s, i) => ({
        id: i + 1, term: s['开课学期'] || s['学期'] || '', courseCode: s['课程编号'] || '',
        courseName: s['课程名称'] || s['课 程名称'] || '', score: s['成绩'] || 0,
        credit: parseFloat(s['学分'] || 0), hours: s['总学时'] || 0,
        gpa: parseFloat(s['绩点'] || 0), assessment: s['考核方式'] || '',
        nature: s['考试性质'] || '', attribute: s['课程属性'] || ''
      }));

      // 合并新旧数据：用已有缓存 + 新获取的数据
      const merged = mergeScores(scores, ts, fetchAll);
      setScores(merged);
      const tset = new Set(merged.map(s => s.term));
      const sortedTerms = Array.from(tset).sort().reverse();
      setTerms(['all', ...sortedTerms]);
      if (sortedTerms.length > 0) setSelectedTerm(sortedTerms[0]);
      // 保存到本地缓存
      localStorage.setItem(`scores_cache_${account.username}`, JSON.stringify({
        scores: merged,
        cachedAt: new Date().toISOString()
      }));
      setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) { setError(`获取成绩失败: ${err.message || '网络错误'}`); }
    finally { setLoading(false); setIsFetchingAll(false); }
  };

  // --- 筛选管道 ---
  let filtered = scores;

  // 1. 学期
  if (selectedTerm !== 'all') {
    filtered = filtered.filter(s => s.term === selectedTerm);
  }

  // 2. 课程属性
  if (attrFilter !== '全部') {
    filtered = filtered.filter(s => s.attribute === attrFilter);
  }

  // 3. 补重成绩
  if (!showRetake) {
    filtered = filtered.filter(s => {
      const n = s.nature || '';
      return !n.includes('补考') && !n.includes('重修') && !n.includes('补');
    });
  }

  // 4. 显示方式（最好成绩 → 按课程编号去重保留最高分）
  if (scoreMode === 'best') {
    const bestMap = {};
    filtered.forEach(s => {
      const key = s.courseCode || s.courseName;
      if (!key) return;
      const scoreNum = parseFloat(s.score) || 0;
      if (!bestMap[key] || scoreNum > (parseFloat(bestMap[key].score) || 0)) {
        bestMap[key] = s;
      }
    });
    filtered = Object.values(bestMap);
  }

  const totalCredits = filtered.reduce((s, c) => s + c.credit, 0).toFixed(2);
  const avgGpa = () => {
    const v = filtered.filter(s => s.gpa > 0);
    return v.length === 0 ? '0.00' : (v.reduce((s, c) => s + c.gpa, 0) / v.length).toFixed(2);
  };

  // 提取属性值去重
  const attrValues = [...new Set(scores.map(s => s.attribute).filter(Boolean))];

  const selectStyle = {
    background: 'var(--bg-surface)', color: 'var(--text-primary)',
    border: '1px solid var(--border-color)', padding: '2px 8px', fontSize: '12px',
    height: '24px', outline: 'none', cursor: 'pointer', borderRadius: '2px'
  };

  return (
    <div style={{ padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>成绩查询</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>💡 如无法获取成绩，请先完成"教学评价"</span>
          <Button appearance="outline" size="small" disabled={loading} onClick={() => fetchScores(true)}>
            {loading && isFetchingAll ? '获取中...' : '获取全部'}
          </Button>
          <Button appearance="primary" disabled={loading} onClick={() => fetchScores(false)} size="small">
            {loading && !isFetchingAll ? '获取中...' : `获取${selectedTerm !== 'all' ? '当前学期' : '成绩'}`}
          </Button>
        </div>
      </div>

      {showSuccess && <div style={{ padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px', background: 'var(--bg-alert-success)', border: '1px solid #c3e6cb', color: '#2e7d32' }}>✓ 成绩获取成功！</div>}
      {error && <div style={{ padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px', background: 'var(--bg-alert-error)', border: '1px solid #f5c6cb', color: '#c62828' }}>✗ {error}</div>}

      {scores.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          {[
            { label: '总学分', value: totalCredits, color: '#0078d4' },
            { label: '平均绩点', value: avgGpa(), color: '#00bcd4' }
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, padding: '12px 16px', background: 'var(--bg-stat-tile)',
              border: '1px solid var(--border-color)', borderLeft: `3px solid ${s.color}`
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {scores.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {/* 学期 */}
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>学期</label>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} style={selectStyle}>
            {terms.map(t => <option key={t} value={t}>{t === 'all' ? '全部学期' : t}</option>)}
          </select>

          {/* 课程属性 */}
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>课程属性</label>
          <select value={attrFilter} onChange={e => setAttrFilter(e.target.value)} style={selectStyle}>
            {ATTR_OPTIONS.map(a => (
              <option key={a} value={a} disabled={a !== '全部' && !attrValues.includes(a)}>{a}</option>
            ))}
          </select>

          {/* 显示方式 */}
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>显示方式</label>
          <select value={scoreMode} onChange={e => setScoreMode(e.target.value)} style={selectStyle}>
            {SCORE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          {/* 补重成绩 */}
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showRetake} onChange={e => setShowRetake(e.target.checked)} />
            显示补考/重修
          </label>

          <Button appearance="outline" size="small" onClick={() => setShowFullData(!showFullData)}>
            {showFullData ? '隐藏完整数据' : '显示完整数据'}
          </Button>
        </div>
      )}

      {scores.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)' }}>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  ['#', '30px'], ['学期', ''], ['课程编号', ''], ['课程名称', ''], ['成绩', '50px'], ['学分', '40px'],
                  ...(showFullData ? [['学时', '50px']] : []), ['绩点', '50px'],
                  ...(showFullData ? [['考核方式', ''], ['课程属性', '']] : []), ['考试性质', '']
                ].map(([label, w]) => (
                  <TableHeaderCell key={label} style={{
                    fontSize: '12px', padding: '4px 8px', color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap', width: w || undefined,
                    background: 'var(--bg-table-header)', borderBottom: '1px solid var(--border-color)'
                  }}>{label}</TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s, i) => (
                <TableRow key={s.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-table-row-even)' : 'var(--bg-table-row-odd)',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '30px' }}>{i + 1}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.term}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.courseCode}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.courseName}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '50px' }}>
                    <ScoreBadge score={s.score} nature={s.nature} />
                  </TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '40px' }}>{s.credit}</TableCell>
                  {showFullData && <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '50px' }}>{s.hours}</TableCell>}
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '50px' }}>{s.gpa}</TableCell>
                  {showFullData && <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.assessment}</TableCell>}
                  {showFullData && <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.attribute}</TableCell>}
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>
                    <NatureBadge nature={s.nature} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && scores.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-secondary)' }}>暂无成绩数据</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>点击上方 "获取成绩" 按钮获取成绩</div>
        </div>
      )}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px 0' }}>
          <Spinner size="large" />
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>正在获取成绩...</div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score, nature }) {
  const isRetake = nature && (nature.includes('补考') || nature.includes('重修') || nature.includes('补'));
  const num = typeof score === 'string' ? parseFloat(score) : score;
  let bg, color;
  if (isNaN(num)) { bg = 'var(--bg-badge-pass)'; color = 'var(--text-primary)'; }
  else if (num >= 90) { bg = 'var(--bg-badge-high)'; color = 'var(--text-badge-high)'; }
  else if (num >= 80) { bg = 'var(--bg-badge-medium)'; color = 'var(--text-badge-medium)'; }
  else if (num >= 60) { bg = 'var(--bg-badge-pass)'; color = 'var(--text-badge-pass)'; }
  else { bg = 'var(--bg-badge-fail)'; color = 'var(--text-badge-fail)'; }

  return (
    <span style={{
      display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px',
      fontSize: '11px', fontWeight: '600', borderRadius: '3px',
      background: isRetake ? '#e65100' : bg,
      color: isRetake ? '#fff' : color,
      fontStyle: isRetake ? 'italic' : 'normal'
    }}>{score}</span>
  );
}

function NatureBadge({ nature }) {
  if (!nature || nature === '正常') return <span style={{ color: 'var(--text-primary)' }}>{nature || '正常'}</span>;
  const isBad = nature.includes('补考') || nature.includes('重修') || nature.includes('补');
  return (
    <span style={{
      display: 'inline-block', padding: '0 6px', height: '18px', lineHeight: '18px',
      fontSize: '11px', fontWeight: '600', borderRadius: '3px',
      background: isBad ? '#e65100' : 'var(--bg-badge-pass)',
      color: isBad ? '#fff' : 'var(--text-primary)'
    }}>{nature}</span>
  );
}

/** 合并新旧成绩：新数据覆盖旧数据的同课程记录，fetchAll 时完全替换 */
function mergeScores(oldScores, newScores, replaceAll) {
  if (replaceAll) return newScores;
  if (!oldScores.length) return newScores;

  const termSet = new Set(newScores.map(s => s.term));
  // 保留旧数据中不属于新获取学期的课程
  const preserved = oldScores.filter(s => !termSet.has(s.term));
  return [...preserved, ...newScores];
}

export default ScoreQuery;
