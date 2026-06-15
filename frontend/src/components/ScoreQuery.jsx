import React, { useState } from 'react';
import {
  Button, Card, Text, Spinner, makeStyles, tokens,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from '@fluentui/react-components';

function ScoreQuery({ account }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [scores, setScores] = useState([]);
  const [terms, setTerms] = useState(['all']);
  const [selectedTerm, setSelectedTerm] = useState('all');
  const [showFullData, setShowFullData] = useState(false);

  const fetchScores = async () => {
    if (!account?.username || !account?.password) { setError('账号信息不完整'); return; }
    setLoading(true); setError(''); setShowSuccess(false);
    try {
      const response = await fetch('http://localhost:5000/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password, name: account.name })
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
      setScores(ts);
      const tset = new Set(ts.map(s => s.term));
      setTerms(['all', ...Array.from(tset).sort().reverse()]);
      setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) { setError(`获取成绩失败: ${err.message || '网络错误'}`); }
    finally { setLoading(false); }
  };

  const filtered = selectedTerm === 'all' ? scores : scores.filter(s => s.term === selectedTerm);
  const totalCredits = filtered.reduce((s, c) => s + c.credit, 0).toFixed(2);
  const avgGpa = () => {
    const v = filtered.filter(s => s.gpa > 0);
    return v.length === 0 ? '0.00' : (v.reduce((s, c) => s + c.gpa, 0) / v.length).toFixed(2);
  };

  return (
    <div style={{ padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>成绩查询</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>💡 如无法获取成绩，请先完成"教学评价"</span>
          <Button appearance="primary" disabled={loading} onClick={fetchScores} size="small">
            {loading ? '获取中...' : '获取成绩'}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>学期</span>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
            style={{
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              border: '1px solid var(--border-color)', padding: '2px 8px', fontSize: '12px',
              height: '24px', outline: 'none', cursor: 'pointer', borderRadius: '2px'
            }}>
            {terms.map(t => <option key={t} value={t}>{t === 'all' ? '全部学期' : t}</option>)}
          </select>
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
                {[['#', '30px'], ['学期', ''], ['课程编号', ''], ['课程名称', ''], ['成绩', '50px'], ['学分', '40px'],
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
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '30px' }}>{s.id}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.term}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.courseCode}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.courseName}</TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '50px' }}>
                    <ScoreBadge score={s.score} />
                  </TableCell>
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '40px' }}>{s.credit}</TableCell>
                  {showFullData && <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '50px' }}>{s.hours}</TableCell>}
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '50px' }}>{s.gpa}</TableCell>
                  {showFullData && <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.assessment}</TableCell>}
                  {showFullData && <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.attribute}</TableCell>}
                  <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{s.nature}</TableCell>
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

function ScoreBadge({ score }) {
  const num = typeof score === 'string' ? parseFloat(score) : score;
  let bg, color;
  if (isNaN(num)) { bg = 'var(--bg-badge-pass)'; color = 'var(--text-primary)'; }
  else if (num >= 90) { bg = 'var(--bg-badge-high)'; color = 'var(--text-badge-high)'; }
  else if (num >= 80) { bg = 'var(--bg-badge-medium)'; color = 'var(--text-badge-medium)'; }
  else if (num >= 60) { bg = 'var(--bg-badge-pass)'; color = 'var(--text-badge-pass)'; }
  else { bg = 'var(--bg-badge-fail)'; color = 'var(--text-badge-fail)'; }

  return <span style={{ display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px', fontSize: '11px', fontWeight: '600', borderRadius: '3px', background: bg, color }}>{score}</span>;
}

export default ScoreQuery;
