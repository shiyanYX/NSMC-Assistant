import React, { useState } from 'react';
import {
  Button, Card, Text, Spinner, makeStyles, tokens,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from '@fluentui/react-components';

const useStyles = makeStyles({
  pageContainer: { padding: '8px' },
  headerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '12px'
  },

  // Stat cards (Task Manager style tiles)
  statsRow: {
    display: 'flex', gap: '12px', marginBottom: '12px'
  },
  statTile: {
    flex: 1, padding: '12px 16px', backgroundColor: '#2d2d2d',
    border: '1px solid #3d3d3d', borderLeft: '3px solid #0078d4'
  },
  statLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statValue: { fontSize: '24px', fontWeight: '600', color: '#e0e0e0', marginTop: '4px' },

  filterRow: {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'
  },

  // Table
  tableWrap: {
    overflowX: 'auto', border: '1px solid #3d3d3d'
  },
  cellNarrow: { fontSize: '12px', padding: '4px 8px', color: '#a0a0a0', whiteSpace: 'nowrap' },
  cell: { fontSize: '12px', padding: '4px 8px', color: '#e0e0e0' },

  // Score badge
  scoreBadge: { display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px', fontSize: '11px', fontWeight: '600', borderRadius: '3px' },

  alerts: {
    padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px'
  },

  emptyState: { padding: '40px 0', textAlign: 'center' },
  loadingState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px 0' }
});

function ScoreQuery({ account }) {
  const styles = useStyles();
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

      const transformedScores = data.data.scores.map((score, index) => ({
        id: index + 1,
        term: score['开课学期'] || score['学期'] || '',
        courseCode: score['课程编号'] || '',
        courseName: score['课程名称'] || score['课 程名称'] || '',
        score: score['成绩'] || 0,
        credit: parseFloat(score['学分'] || 0),
        hours: score['总学时'] || 0,
        gpa: parseFloat(score['绩点'] || 0),
        assessment: score['考核方式'] || '',
        nature: score['考试性质'] || '',
        attribute: score['课程属性'] || ''
      }));

      setScores(transformedScores);
      const termSet = new Set(transformedScores.map(s => s.term));
      setTerms(['all', ...Array.from(termSet).sort().reverse()]);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      setError(`获取成绩失败: ${err.message || '网络错误'}`);
    } finally { setLoading(false); }
  };

  const filteredScores = selectedTerm === 'all' ? scores : scores.filter(s => s.term === selectedTerm);
  const totalCredits = filteredScores.reduce((sum, s) => sum + s.credit, 0).toFixed(2);
  const averageGpa = () => {
    const valid = filteredScores.filter(s => s.gpa > 0);
    return valid.length === 0 ? '0.00' : (valid.reduce((sum, s) => sum + s.gpa, 0) / valid.length).toFixed(2);
  };

  const scoreStyle = (s) => {
    const num = typeof s === 'string' ? parseFloat(s) : s;
    if (isNaN(num)) return { bg: '#2d2d2d', color: '#a0a0a0' };
    if (num >= 90) return { bg: '#1b5e20', color: '#81c784' };
    if (num >= 80) return { bg: '#1a237e', color: '#90caf9' };
    if (num >= 60) return { bg: '#3d3d3d', color: '#e0e0e0' };
    return { bg: '#b71c1c', color: '#ef9a9a' };
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.headerRow}>
        <Text weight="semibold" style={{ color: '#e0e0e0' }}>成绩查询</Text>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Text style={{ fontSize: '11px', color: '#888' }}>💡 如无法获取成绩，请先完成"教学评价"</Text>
          <Button appearance="primary" disabled={loading} onClick={fetchScores} size="small">
            {loading ? '获取中...' : '获取成绩'}
          </Button>
        </div>
      </div>

      {showSuccess && <div className={styles.alerts} style={{ background: '#1b5e20', border: '1px solid #2e7d32', color: '#81c784' }}>✓ 成绩获取成功！</div>}
      {error && <div className={styles.alerts} style={{ background: '#b71c1c', border: '1px solid #c62828', color: '#ef9a9a' }}>✗ {error}</div>}

      {scores.length > 0 && (
        <div className={styles.statsRow}>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>总学分</div>
            <div className={styles.statValue}>{totalCredits}</div>
          </div>
          <div className={styles.statTile} style={{ borderLeftColor: '#00bcd4' }}>
            <div className={styles.statLabel}>平均绩点</div>
            <div className={styles.statValue}>{averageGpa()}</div>
          </div>
        </div>
      )}

      {scores.length > 0 && (
        <div className={styles.filterRow}>
          <Text style={{ fontSize: '11px', color: '#888', fontWeight: '600', whiteSpace: 'nowrap' }}>学期</Text>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            style={{
              background: '#2d2d2d', color: '#e0e0e0', border: '1px solid #3d3d3d',
              padding: '2px 8px', fontSize: '12px', height: '24px', outline: 'none',
              cursor: 'pointer', borderRadius: '2px'
            }}
          >
            {terms.map(t => (
              <option key={t} value={t}>{t === 'all' ? '全部学期' : t}</option>
            ))}
          </select>
          <Button appearance="outline" size="small" onClick={() => setShowFullData(!showFullData)}>
            {showFullData ? '隐藏完整数据' : '显示完整数据'}
          </Button>
        </div>
      )}

      {scores.length > 0 && (
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '40px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>#</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>学期</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>课程编号</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>课程名称</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '50px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>成绩</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '40px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>学分</TableHeaderCell>
                {showFullData && <TableHeaderCell className={styles.cellNarrow} style={{ width: '50px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>学时</TableHeaderCell>}
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '50px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>绩点</TableHeaderCell>
                {showFullData && <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>考核方式</TableHeaderCell>}
                <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>考试性质</TableHeaderCell>
                {showFullData && <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>课程属性</TableHeaderCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredScores.map((s, idx) => (
                <TableRow key={s.id} style={{ background: idx % 2 === 0 ? '#252525' : '#2a2a2a', borderBottom: '1px solid #333' }}>
                  <TableCell className={styles.cellNarrow} style={{ width: '40px' }}>{s.id}</TableCell>
                  <TableCell className={styles.cell}>{s.term}</TableCell>
                  <TableCell className={styles.cell}>{s.courseCode}</TableCell>
                  <TableCell className={styles.cell}>{s.courseName}</TableCell>
                  <TableCell className={styles.cellNarrow} style={{ width: '50px' }}>
                    <span className={styles.scoreBadge} style={{ background: scoreStyle(s.score).bg, color: scoreStyle(s.score).color }}>
                      {s.score}
                    </span>
                  </TableCell>
                  <TableCell className={styles.cellNarrow} style={{ width: '40px' }}>{s.credit}</TableCell>
                  {showFullData && <TableCell className={styles.cellNarrow} style={{ width: '50px' }}>{s.hours}</TableCell>}
                  <TableCell className={styles.cellNarrow} style={{ width: '50px' }}>{s.gpa}</TableCell>
                  {showFullData && <TableCell className={styles.cell}>{s.assessment}</TableCell>}
                  <TableCell className={styles.cell}>{s.nature}</TableCell>
                  {showFullData && <TableCell className={styles.cell}>{s.attribute}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && scores.length === 0 && (
        <div className={styles.emptyState}>
          <Text style={{ color: '#a0a0a0' }}>暂无成绩数据</Text>
          <Text style={{ fontSize: '12px', color: '#666' }}>点击上方 "获取成绩" 按钮获取成绩</Text>
        </div>
      )}
      {loading && (
        <div className={styles.loadingState}>
          <Spinner size="large" />
          <Text style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>正在获取成绩...</Text>
        </div>
      )}
    </div>
  );
}

export default ScoreQuery;
