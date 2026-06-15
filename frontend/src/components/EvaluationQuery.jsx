import React, { useState } from 'react';
import {
  Button, Card, Text, Spinner, makeStyles, tokens,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from '@fluentui/react-components';

const useStyles = makeStyles({
  pageContainer: { padding: '8px' },
  headerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'
  },

  statsRow: {
    display: 'flex', gap: '12px', marginBottom: '12px'
  },
  statTile: {
    flex: 1, padding: '12px 16px', backgroundColor: '#2d2d2d',
    border: '1px solid #3d3d3d', borderLeft: '3px solid #0078d4'
  },
  statLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statValue: { fontSize: '24px', fontWeight: '600', color: '#e0e0e0', marginTop: '4px' },

  tableWrap: {
    overflowX: 'auto', border: '1px solid #3d3d3d'
  },
  cell: { fontSize: '12px', padding: '4px 8px', color: '#e0e0e0' },
  cellNarrow: { fontSize: '12px', padding: '4px 8px', color: '#a0a0a0', whiteSpace: 'nowrap' },

  alerts: {
    padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px'
  },

  emptyState: { padding: '40px 0', textAlign: 'center' },
  loadingState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px 0' }
});

function EvaluationQuery({ account }) {
  const styles = useStyles();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [progress, setProgress] = useState('');

  const fetchTeachers = async () => {
    if (!account?.username || !account?.password) { setError('账号信息不完整'); return; }
    setLoading(true); setError(''); setInfo(''); setShowSuccess(false);
    try {
      const res = await fetch('http://localhost:5000/api/evaluation/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password })
      });
      const data = await res.json();
      if (data.success) {
        setTeachers(data.data.teachers);
        setInfo(`共 ${data.data.total} 人，已提交 ${data.data.submitted}，待评 ${data.data.unsubmitted}`);
      } else { setError(data.message || '获取评价列表失败'); }
    } catch (err) { setError(`网络错误: ${err.message || '连接失败'}`); }
    finally { setLoading(false); }
  };

  const submitAll = async () => {
    const unsubmitted = teachers.filter(t => t.submitted !== '是');
    if (unsubmitted.length === 0) { setInfo('没有需要评价的教师'); return; }
    if (!window.confirm(`将对 ${unsubmitted.length} 位教师进行自动评教：\n` +
      '• 前 9 道题选"非常满意"\n• 最后 1 道题选"满意"\n• 建议留空\n\n确认开始？')) return;

    setSubmitting(true); setError(''); setInfo(''); setShowSuccess(false);
    let ok = 0, fail = 0;

    for (let i = 0; i < unsubmitted.length; i++) {
      const t = unsubmitted[i];
      setProgress(`[${i + 1}/${unsubmitted.length}] ${t.teacher_name} ...`);
      try {
        const res = await fetch('http://localhost:5000/api/evaluation/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: account.username, password: account.password, teacher: t, do_submit: true })
        });
        const data = await res.json();
        if (data.success) {
          ok++;
          setTeachers(prev => prev.map(p => p.teacher_id === t.teacher_id && p.url === t.url ? { ...p, submitted: '是' } : p));
        } else { fail++; console.error(`${t.teacher_name} - ${data.message}`); }
      } catch (err) { fail++; console.error(`${t.teacher_name} - ${err.message}`); }
    }

    setProgress(''); setSubmitting(false);
    if (fail === 0) { setShowSuccess(true); setTimeout(() => setShowSuccess(false), 5000); }
    else { setError(`${ok} 成功, ${fail} 失败`); }
  };

  const unsubmittedCount = teachers.filter(t => t.submitted !== '是').length;
  const submittedCount = teachers.length - unsubmittedCount;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.headerRow}>
        <Text weight="semibold" style={{ color: '#e0e0e0' }}>教学评价</Text>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button appearance="primary" disabled={loading || submitting} onClick={fetchTeachers} size="small">
            {loading ? '获取中...' : '刷新列表'}
          </Button>
          <Button appearance="primary" disabled={loading || submitting || unsubmittedCount === 0}
            onClick={submitAll} size="small" style={{ backgroundColor: '#107c10' }}>
            {submitting ? '评教中...' : `一键评教 (${unsubmittedCount})`}
          </Button>
        </div>
      </div>

      {showSuccess && <div className={styles.alerts} style={{ background: '#1b5e20', border: '1px solid #2e7d32', color: '#81c784' }}>✓ 评教完成！所有教师已提交。</div>}
      {error && <div className={styles.alerts} style={{ background: '#b71c1c', border: '1px solid #c62828', color: '#ef9a9a' }}>✗ {error}</div>}
      {info && !error && <div className={styles.alerts} style={{ background: '#1a237e', border: '1px solid #283593', color: '#90caf9' }}>
        ℹ {info}{submitting && <span style={{ marginLeft: '12px' }}>{progress}</span>}
      </div>}

      {teachers.length > 0 && (
        <div className={styles.statsRow}>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>总人数</div>
            <div className={styles.statValue}>{teachers.length}</div>
          </div>
          <div className={styles.statTile} style={{ borderLeftColor: '#4caf50' }}>
            <div className={styles.statLabel}>已提交</div>
            <div className={styles.statValue} style={{ color: '#81c784' }}>{submittedCount}</div>
          </div>
          <div className={styles.statTile} style={{ borderLeftColor: '#ff9800' }}>
            <div className={styles.statLabel}>待评</div>
            <div className={styles.statValue} style={{ color: '#ffb74d' }}>{unsubmittedCount}</div>
          </div>
        </div>
      )}

      {teachers.length > 0 && (
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '30px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>#</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '60px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>教师编号</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>教师姓名</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ background: '#252525', borderBottom: '1px solid #3d3d3d' }}>所属院系</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '80px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>评教类别</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '60px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>总评分</TableHeaderCell>
                <TableHeaderCell className={styles.cellNarrow} style={{ width: '70px', background: '#252525', borderBottom: '1px solid #3d3d3d' }}>状态</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((t, idx) => {
                const done = t.submitted === '是';
                return (
                  <TableRow key={`${t.teacher_id}-${idx}`}
                    style={{ background: done ? '#1a3a1a' : (idx % 2 === 0 ? '#252525' : '#2a2a2a'), borderBottom: '1px solid #333' }}>
                    <TableCell className={styles.cellNarrow} style={{ width: '30px' }}>{t.seq}</TableCell>
                    <TableCell className={styles.cellNarrow} style={{ width: '60px' }}>{t.teacher_id}</TableCell>
                    <TableCell className={styles.cell}>{t.teacher_name}</TableCell>
                    <TableCell className={styles.cell}>{t.dept}</TableCell>
                    <TableCell className={styles.cellNarrow} style={{ width: '80px' }}>{t.eval_type}</TableCell>
                    <TableCell className={styles.cellNarrow} style={{ width: '60px' }}>{t.total_score}</TableCell>
                    <TableCell className={styles.cellNarrow} style={{ width: '70px' }}>
                      {done ? (
                        <span style={{ display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px', fontSize: '11px', fontWeight: '600', borderRadius: '3px', background: '#1b5e20', color: '#81c784' }}>✓ 已提交</span>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px', fontSize: '11px', fontWeight: '600', borderRadius: '3px', background: '#e65100', color: '#ffb74d' }}>待评</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && teachers.length === 0 && (
        <div className={styles.emptyState}>
          <Text style={{ color: '#a0a0a0' }}>暂无评价数据</Text>
          <Text style={{ fontSize: '12px', color: '#666' }}>点击上方 "刷新列表" 按钮获取</Text>
        </div>
      )}
      {loading && (
        <div className={styles.loadingState}>
          <Spinner size="large" />
          <Text style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>正在获取评价列表...</Text>
        </div>
      )}
    </div>
  );
}

export default EvaluationQuery;
