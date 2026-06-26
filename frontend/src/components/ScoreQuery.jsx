import React, { useState, useEffect, useRef } from 'react';

const SCORE_MODES = [
  { value: 'all', label: '显示全部成绩' },
  { value: 'best', label: '显示最好成绩' },
];
const ATTR_OPTIONS = ['全部', '必修', '限选', '任选', '公选'];

function ScoreBadge({ score, nature }) {
  const isRetake = nature && (nature.includes('补考') || nature.includes('重修') || nature.includes('补'));
  const num = typeof score === 'string' ? parseFloat(score) : score;
  let cls = 's-badge s-badge-c';
  if (isRetake) cls = 's-badge s-badge-retake';
  else if (isNaN(num)) cls = 's-badge s-badge-c';
  else if (num >= 90) cls = 's-badge s-badge-a';
  else if (num >= 80) cls = 's-badge s-badge-b';
  else if (num >= 60) cls = 's-badge s-badge-c';
  else cls = 's-badge s-badge-d';
  return <span className={cls}>{score}</span>;
}

function NatureBadge({ nature }) {
  if (!nature || nature === '正常') return <span className="n-dot n-normal" />;
  const isBad = nature.includes('补考') || nature.includes('重修') || nature.includes('补');
  return <span className={'n-badge' + (isBad ? ' n-retake' : ' n-ok')}>{nature}</span>;
}

function mergeScores(oldScores, newScores, replaceAll) {
  if (replaceAll) return newScores;
  if (!oldScores.length) return newScores;
  const termSet = new Set(newScores.map(s => s.term));
  const preserved = oldScores.filter(s => !termSet.has(s.term));
  return [...preserved, ...newScores];
}

function ScoreQuery({ account }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const autoFetched = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [scores, setScores] = useState([]);
  const [terms, setTerms] = useState(['all']);
  const [selectedTerm, setSelectedTerm] = useState('all');
  const [showFullData, setShowFullData] = useState(false);
  const [attrFilter, setAttrFilter] = useState('全部');
  const [scoreMode, setScoreMode] = useState('all');
  const [showRetake, setShowRetake] = useState(true);
  const [isFetchingAll, setIsFetchingAll] = useState(false);

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

  // 登录后自动获取：仅首次挂载 + 无缓存时触发，只查最新学期
  useEffect(() => {
    if (!account?.username || !account?.password) return;
    if (autoFetched.current) return;
    const cached = localStorage.getItem(`scores_cache_${account.username}`);
    if (cached) return;
    autoFetched.current = true;
    doAutoFetch();
  }, [account?.username, account?.password]);

  const doAutoFetch = () => {
    setLoading(true);
    fetch('http://localhost:5000/api/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: account.username, password: account.password, name: account.name, term: 'latest' })
    }).then(r => r.json()).then(data => {
      if (!data.success) return;
      const ts = data.data.scores.map((s, i) => ({
        id: i + 1, term: s['开课学期'] || s['学期'] || '', courseCode: s['课程编号'] || '',
        courseName: s['课程名称'] || s['课 程名称'] || '', score: s['成绩'] || 0,
        credit: parseFloat(s['学分'] || 0), hours: s['总学时'] || 0,
        gpa: parseFloat(s['绩点'] || 0), assessment: s['考核方式'] || '',
        nature: s['考试性质'] || '', attribute: s['课程属性'] || ''
      }));
      setScores(ts);
      const tset = new Set(ts.map(s => s.term));
      const sortedTerms = Array.from(tset).sort().reverse();
      setTerms(['all', ...sortedTerms]);
      if (sortedTerms.length > 0) setSelectedTerm(sortedTerms[0]);
      localStorage.setItem(`scores_cache_${account.username}`, JSON.stringify({ scores: ts, cachedAt: new Date().toISOString() }));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const fetchScores = async (fetchAll) => {
    if (!account?.username || !account?.password) { setError('账号信息不完整'); return; }
    setLoading(true); setError(''); setShowSuccess(false);
    setIsFetchingAll(!!fetchAll);
    try {
      // fetchAll=true 或学期未选时查全部；否则只查指定学期
      const term = fetchAll ? undefined : (selectedTerm !== 'all' ? selectedTerm : 'latest');
      const response = await fetch('http://localhost:5000/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password, name: account.name, term })
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
      const merged = mergeScores(scores, ts, fetchAll);
      setScores(merged);
      const tset = new Set(merged.map(s => s.term));
      const sortedTerms = Array.from(tset).sort().reverse();
      setTerms(['all', ...sortedTerms]);
      if (sortedTerms.length > 0) setSelectedTerm(sortedTerms[0]);
      localStorage.setItem(`scores_cache_${account.username}`, JSON.stringify({ scores: merged, cachedAt: new Date().toISOString() }));
      setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) { setError(`获取成绩失败: ${err.message || '网络错误'}`); }
    finally { setLoading(false); setIsFetchingAll(false); }
  };

  // Filter pipeline
  let filtered = scores;
  if (selectedTerm !== 'all') filtered = filtered.filter(s => s.term === selectedTerm);
  if (attrFilter !== '全部') filtered = filtered.filter(s => s.attribute === attrFilter);
  if (!showRetake) filtered = filtered.filter(s => { const n = s.nature || ''; return !n.includes('补考') && !n.includes('重修') && !n.includes('补'); });
  if (scoreMode === 'best') {
    const bestMap = {};
    filtered.forEach(s => { const key = s.courseCode || s.courseName; if (!key) return; const sn = parseFloat(s.score) || 0; if (!bestMap[key] || sn > (parseFloat(bestMap[key].score) || 0)) bestMap[key] = s; });
    filtered = Object.values(bestMap);
  }

  const totalCredits = filtered.reduce((s, c) => s + c.credit, 0).toFixed(2);
  const avgGpa = () => { const v = filtered.filter(s => s.gpa > 0); return v.length === 0 ? '0.00' : (v.reduce((s, c) => s + c.gpa, 0) / v.length).toFixed(2); };
  const attrValues = [...new Set(scores.map(s => s.attribute).filter(Boolean))];

  const hasData = scores.length > 0;
  const showFiltered = filtered.length > 0;

  return (
    <div className="sq-root">
      <div className="sq-header">
        <h2>成绩查询</h2>
        <div className="sq-actions">
          <span className="sq-hint">如无法获取请先完成评教</span>
          <button className="btn btn-outline" disabled={loading} onClick={() => fetchScores(true)}>
            {loading && isFetchingAll ? '获取中...' : '获取全部'}
          </button>
          <button className="btn btn-primary" disabled={loading} onClick={() => fetchScores(false)}>
            {loading && !isFetchingAll ? '获取中...' : `获取${selectedTerm !== 'all' ? '当前学期' : '成绩'}`}
          </button>
          <button className="btn btn-outline" style={{color:'var(--danger-fg)',borderColor:'var(--danger-fg)'}} onClick={() => {
            localStorage.removeItem(`scores_cache_${account?.username}`);
            setScores([]); setTerms(['all']); setSelectedTerm('all');
          }}>
            清除缓存
          </button>
        </div>
      </div>

      {showSuccess && <div className="msg msg-success">✓ 成绩获取成功！</div>}
      {error && <div className="msg msg-error">✗ {error}</div>}

      {hasData && (
        <>
          {/* Stat cards */}
          <div className="sq-stats">
            <div className="sq-stat"><div className="sq-stat-lbl">总学分</div><div className="sq-stat-val">{totalCredits}</div></div>
            <div className="sq-stat"><div className="sq-stat-lbl">平均绩点</div><div className="sq-stat-val">{avgGpa()}</div></div>
          </div>

          {/* Filters */}
          <div className="sq-filters">
            <label>学期</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              {terms.map(t => <option key={t} value={t}>{t === 'all' ? '全部学期' : t}</option>)}
            </select>

            <label>属性</label>
            <select value={attrFilter} onChange={e => setAttrFilter(e.target.value)}>
              {ATTR_OPTIONS.map(a => <option key={a} value={a} disabled={a !== '全部' && !attrValues.includes(a)}>{a}</option>)}
            </select>

            <label>显示</label>
            <select value={scoreMode} onChange={e => setScoreMode(e.target.value)}>
              {SCORE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>

            <label className="sq-check">
              <input type="checkbox" checked={showRetake} onChange={e => setShowRetake(e.target.checked)} />
              补考/重修
            </label>

            <button className="btn btn-text" onClick={() => setShowFullData(!showFullData)}>
              {showFullData ? '精简' : '完整'}
            </button>
          </div>

          {/* Table */}
          <div className="sq-table-wrap">
            <table className="sq-table">
              <thead>
                <tr>
                  <th style={{width:30}}>#</th>
                  <th>学期</th>
                  <th>课程编号</th>
                  <th>课程名称</th>
                  <th style={{width:55}}>成绩</th>
                  <th style={{width:40}}>学分</th>
                  {showFullData && <th style={{width:45}}>学时</th>}
                  <th style={{width:45}}>绩点</th>
                  {showFullData && <th>考核方式</th>}
                  {showFullData && <th>课程属性</th>}
                  <th>考试性质</th>
                </tr>
              </thead>
              <tbody>
                {showFiltered ? filtered.map((s, i) => (
                  <tr key={s.id}>
                    <td className="td-muted" style={{width:30}}>{i + 1}</td>
                    <td>{s.term}</td>
                    <td className="td-muted">{s.courseCode}</td>
                    <td>{s.courseName}</td>
                    <td><ScoreBadge score={s.score} nature={s.nature} /></td>
                    <td className="td-muted">{s.credit}</td>
                    {showFullData && <td className="td-muted">{s.hours}</td>}
                    <td className="td-muted">{s.gpa || '—'}</td>
                    {showFullData && <td className="td-muted">{s.assessment}</td>}
                    {showFullData && <td className="td-muted">{s.attribute}</td>}
                    <td><NatureBadge nature={s.nature} /></td>
                  </tr>
                )) : (
                  <tr><td colSpan={showFullData ? 11 : 8} className="td-empty">没有匹配的成绩</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !hasData && (
        <div className="sq-empty">
          <p>暂无成绩数据</p>
          <span className="sq-empty-hint">点击上方「获取成绩」按钮开始查询</span>
        </div>
      )}

      {loading && (
        <div className="sq-loading">
          <div className="spinner" />
          <p>正在获取成绩...</p>
        </div>
      )}

      <style>{`
        .sq-root { }
        .sq-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .sq-header h2 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
        .sq-actions { display: flex; gap: 8px; align-items: center; }
        .sq-hint { font-size: 11px; color: var(--muted); padding: 3px 8px; background: var(--accent-bg); border-radius: 4px; }

        .btn {
          height: 28px; padding: 0 12px; border: 0; border-radius: var(--radius-xs);
          font: 500 12px/1 var(--font); cursor: pointer; white-space: nowrap;
          transition: opacity 0.12s;
        }
        .btn:active { transform: scale(0.97); }
        .btn-primary { background: var(--accent); color: #fff; }
        .btn-primary:hover { opacity: 0.88; }
        .btn-primary:disabled { opacity: 0.5; cursor: default; transform: none; }
        .btn-outline { background: transparent; color: var(--muted); border: 1px solid var(--border); }
        .btn-outline:hover { background: var(--surface-hover); }
        .btn-outline:disabled { opacity: 0.4; cursor: default; }
        .btn-text { background: transparent; color: var(--muted); border: 0; cursor: pointer; font-size: 12px; padding: 0 4px; }
        .btn-text:hover { color: var(--fg); }

        .msg { padding: 9px 14px; margin-bottom: 12px; border-radius: var(--radius-sm); font-size: 13px; }
        .msg-success { background: var(--success-bg); color: var(--success-fg); }
        .msg-error { background: var(--danger-bg); color: var(--danger-fg); }

        .sq-stats { display: flex; gap: 12px; margin-bottom: 14px; }
        .sq-stat { flex: 1; padding: 12px 16px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); }
        .sq-stat-lbl { font-size: 11px; color: var(--muted); letter-spacing: 0.03em; margin-bottom: 3px; }
        .sq-stat-val { font: 600 24px/1.2 system-ui; letter-spacing: -0.02em; }

        .sq-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; padding: 8px 14px; background: var(--surface); border-radius: var(--radius-sm); border: 1px solid var(--border); }
        .sq-filters label { font-size: 11px; color: var(--muted); font-weight: 500; white-space: nowrap; }
        .sq-filters select {
          height: 26px; padding: 0 20px 0 7px; border: 1px solid var(--border); border-radius: 4px;
          font: 12px/1 var(--font); color: var(--fg); background: var(--surface);
          cursor: pointer; outline: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='8' height='5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23999' stroke-width='1.2'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 5px center;
        }
        .sq-check { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: var(--muted); }
        .sq-check input { accent-color: var(--accent); width: 14px; height: 14px; cursor: pointer; }

        .sq-table-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
        .sq-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .sq-table thead { background: var(--surface); }
        .sq-table th { padding: 7px 9px; text-align: left; font-weight: 500; color: var(--muted); white-space: nowrap; border-bottom: 1px solid var(--border); font-size: 11px; letter-spacing: 0.02em; }
        .sq-table td { padding: 6px 9px; color: var(--fg); border-bottom: 1px solid var(--border); }
        .sq-table tbody tr:nth-child(even) { background: var(--surface); }
        .sq-table tbody tr:last-child td { border-bottom: 0; }
        .td-muted { color: var(--muted) !important; }
        .td-empty { text-align: center; padding: 28px !important; color: var(--muted); }

        .s-badge { display: inline-block; padding: 0 6px; height: 19px; line-height: 19px; font-size: 11px; font-weight: 600; border-radius: 3px; white-space: nowrap; }
        .s-badge-a { background: oklch(55% 0.12 145 / 0.12); color: oklch(40% 0.12 145); }
        .s-badge-b { background: oklch(50% 0.12 255 / 0.12); color: oklch(38% 0.12 255); }
        .s-badge-c { background: oklch(55% 0 0 / 0.08); color: var(--muted); }
        .s-badge-d { background: var(--danger-bg); color: var(--danger-fg); }
        .s-badge-retake { background: oklch(50% 0.14 50); color: #fff; font-style: italic; }

        .n-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
        .n-normal { background: var(--success-fg); }
        .n-badge { display: inline-block; padding: 0 6px; height: 18px; line-height: 18px; font-size: 11px; font-weight: 600; border-radius: 3px; }
        .n-ok { background: var(--success-bg); color: var(--success-fg); }
        .n-retake { background: oklch(50% 0.14 50 / 0.1); color: oklch(42% 0.12 50); }

        .spinner {
          width: 28px; height: 28px; margin: 0 auto;
          border: 3px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: sq-spin 0.7s linear infinite;
        }
        @keyframes sq-spin { to { transform: rotate(360deg); } }

        .sq-empty { padding: 48px 0; text-align: center; }
        .sq-empty p { color: var(--muted); font-size: 14px; margin: 0 0 4px; }
        .sq-empty-hint { font-size: 12px; color: var(--muted); }
        .sq-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 0; }
        .sq-loading p { font-size: 13px; color: var(--muted); margin: 0; }
      `}</style>
    </div>
  );
}

export default ScoreQuery;
