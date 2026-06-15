import React, { useState } from 'react';
import {
  Button, Card, Text, Spinner,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from '@fluentui/react-components';

function EvaluationQuery({ account }) {
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
    if (!window.confirm(`将对 ${unsubmitted.length} 位教师进行自动评教：\n• 前 9 道题选"非常满意"\n• 最后 1 道题选"满意"\n• 建议留空\n\n确认开始？`)) return;

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
    <div style={{ padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>教学评价</span>
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

      {showSuccess && <div style={{ padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px', background: 'var(--bg-alert-success)', border: '1px solid #c3e6cb', color: '#2e7d32' }}>✓ 评教完成！所有教师已提交。</div>}
      {error && <div style={{ padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px', background: 'var(--bg-alert-error)', border: '1px solid #f5c6cb', color: '#c62828' }}>✗ {error}</div>}
      {info && !error && <div style={{ padding: '6px 12px', marginBottom: '12px', fontSize: '12px', borderRadius: '3px', background: 'var(--bg-alert-info)', border: '1px solid #b8daff', color: '#1565c0' }}>
        ℹ {info}{submitting && <span style={{ marginLeft: '12px' }}>{progress}</span>}
      </div>}

      {teachers.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          {[
            { label: '总人数', value: teachers.length, color: '#0078d4' },
            { label: '已提交', value: submittedCount, color: '#4caf50' },
            { label: '待评', value: unsubmittedCount, color: '#ff9800' }
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

      {teachers.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)' }}>
          <Table>
            <TableHeader>
              <TableRow>
                {[['#', '30px'], ['教师编号', '60px'], ['教师姓名', ''], ['所属院系', ''], ['评教类别', '80px'], ['总评分', '60px'], ['状态', '70px']].map(([label, w]) => (
                  <TableHeaderCell key={label} style={{
                    fontSize: '12px', padding: '4px 8px', color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap', width: w || undefined,
                    background: 'var(--bg-table-header)', borderBottom: '1px solid var(--border-color)'
                  }}>{label}</TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((t, i) => {
                const done = t.submitted === '是';
                return (
                  <TableRow key={`${t.teacher_id}-${i}`} style={{
                    background: done ? 'var(--bg-evaluated-row)' : (i % 2 === 0 ? 'var(--bg-table-row-even)' : 'var(--bg-table-row-odd)'),
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '30px' }}>{t.seq}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '60px' }}>{t.teacher_id}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{t.teacher_name}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-primary)' }}>{t.dept}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '80px' }}>{t.eval_type}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '60px' }}>{t.total_score}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '70px' }}>
                      {done ? (
                        <span style={{ display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px', fontSize: '11px', fontWeight: '600', borderRadius: '3px', background: 'var(--bg-badge-submitted)', color: '#2e7d32' }}>✓ 已提交</span>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '0 8px', height: '20px', lineHeight: '20px', fontSize: '11px', fontWeight: '600', borderRadius: '3px', background: 'var(--bg-badge-pending)', color: '#e65100' }}>待评</span>
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
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-secondary)' }}>暂无评价数据</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>点击上方 "刷新列表" 按钮获取</div>
        </div>
      )}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px 0' }}>
          <Spinner size="large" />
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>正在获取评价列表...</div>
        </div>
      )}
    </div>
  );
}

export default EvaluationQuery;
