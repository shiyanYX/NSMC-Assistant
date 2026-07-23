import React, { useState } from 'react';
import { apiEvaluationList, apiEvaluationSubmit } from '../api';

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
      const data = await apiEvaluationList(account.username, account.password);
      setTeachers(data.teachers);
      setInfo(`共 ${data.total} 人，已提交 ${data.submitted}，待评 ${data.unsubmitted}`);
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
        const data = await apiEvaluationSubmit(account.username, account.password, t, true);
        if (data.success || data.message?.includes('成功')) {
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
  const hasData = teachers.length > 0;

  return (
    <div className="eq-root">
      <div className="eq-header">
        <h2>教学评价</h2>
        <div className="eq-actions">
          <button className="btn btn-outline" disabled={loading || submitting} onClick={fetchTeachers}>
            {loading ? '获取中...' : '刷新列表'}
          </button>
          <button className="btn btn-green" disabled={loading || submitting || unsubmittedCount === 0} onClick={submitAll}>
            {submitting ? '评教中...' : `一键评教 (${unsubmittedCount})`}
          </button>
        </div>
      </div>

      {showSuccess && <div className="msg msg-success">✓ 评教完成！所有教师已提交。</div>}
      {error && <div className="msg msg-error">✗ {error}</div>}
      {info && !error && <div className="msg msg-info">ℹ {info}{submitting && <span style={{ marginLeft: 12 }}>{progress}</span>}</div>}

      {submitting && (
        <div className="eq-progress">
          <div className="eq-progress-bar"><div className="eq-progress-fill" style={{ width: progress ? '50%' : '0%' }} /></div>
          <span className="eq-progress-text">{progress || '准备中...'}</span>
        </div>
      )}

      {hasData && (
        <>
          <div className="eq-stats">
            <div className="eq-stat"><div className="eq-stat-lbl">总人数</div><div className="eq-stat-val">{teachers.length}</div></div>
            <div className="eq-stat"><div className="eq-stat-lbl">已提交</div><div className="eq-stat-val" style={{ color: 'var(--success-fg)' }}>{submittedCount}</div></div>
            <div className="eq-stat"><div className="eq-stat-lbl">待评</div><div className="eq-stat-val" style={{ color: 'oklch(45% 0.12 50)' }}>{unsubmittedCount}</div></div>
          </div>

          <div className="eq-table-wrap">
            <table className="eq-table">
              <thead>
                <tr>
                  <th style={{width:30}}>#</th>
                  <th style={{width:70}}>教师编号</th>
                  <th>教师姓名</th>
                  <th>所属院系</th>
                  <th style={{width:80}}>评教类别</th>
                  <th style={{width:60}}>总评分</th>
                  <th style={{width:70}}>状态</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t, i) => {
                  const done = t.submitted === '是';
                  return (
                    <tr key={`${t.teacher_id}-${i}`} className={done ? 'tr-done' : ''}>
                      <td className="td-muted" style={{width:30}}>{t.seq}</td>
                      <td className="td-muted" style={{width:70}}>{t.teacher_id}</td>
                      <td>{t.teacher_name}</td>
                      <td>{t.dept}</td>
                      <td className="td-muted" style={{width:80}}>{t.eval_type}</td>
                      <td className="td-muted" style={{width:60}}>{t.total_score}</td>
                      <td style={{width:70}}>
                        {done ? <span className="e-badge e-done">✓ 已提交</span> : <span className="e-badge e-pending">待评</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !hasData && (
        <div className="eq-empty">
          <p>暂无评价数据</p>
          <span className="eq-empty-hint">点击上方「刷新列表」按钮获取</span>
        </div>
      )}

      {loading && (
        <div className="eq-loading">
          <div className="spinner" />
          <p>正在获取评价列表...</p>
        </div>
      )}

      <style>{`
        .eq-root {}
        .eq-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
        .eq-header h2 { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
        .eq-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

        .btn {
          height: 30px; padding: 0 11px; border: 0; border-radius: var(--radius-xs);
          font: 500 12px/1 var(--font); cursor: pointer; white-space: nowrap;
          transition: opacity 0.12s; -webkit-tap-highlight-color: transparent;
        }
        .btn:active { transform: scale(0.97); }
        .btn-outline { background: transparent; color: var(--muted); border: 1px solid var(--border); }
        .btn-outline:disabled { opacity: 0.4; cursor: default; }
        .btn-green { background: var(--success-fg); color: #fff; }
        .btn-green:disabled { opacity: 0.5; cursor: default; }

        .msg { padding: 9px 14px; margin-bottom: 10px; border-radius: var(--radius-sm); font-size: 13px; }
        .msg-success { background: var(--success-bg); color: var(--success-fg); }
        .msg-error { background: var(--danger-bg); color: var(--danger-fg); }
        .msg-info { background: var(--info-bg); color: var(--info-fg); }

        .eq-progress { padding: 9px 14px; margin-bottom: 12px; border-radius: var(--radius-sm); background: var(--info-bg); display: flex; align-items: center; gap: 10px; }
        .eq-progress-bar { flex: 1; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
        .eq-progress-fill { height: 100%; border-radius: 2px; background: var(--accent); transition: width 0.3s; }
        .eq-progress-text { font-size: 12px; color: var(--info-fg); white-space: nowrap; }

        .eq-stats { display: flex; gap: 10px; margin-bottom: 12px; }
        .eq-stat { flex: 1; padding: 10px 14px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); }
        .eq-stat-lbl { font-size: 11px; color: var(--muted); letter-spacing: 0.03em; margin-bottom: 2px; }
        .eq-stat-val { font: 600 20px/1.2 system-ui; letter-spacing: -0.02em; }

        .eq-table-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .eq-table { min-width: 600px; width: 100%; border-collapse: collapse; font-size: 12px; }
        .eq-table thead { background: var(--surface); }
        .eq-table th { padding: 7px 8px; text-align: left; font-weight: 500; color: var(--muted); white-space: nowrap; border-bottom: 1px solid var(--border); font-size: 11px; letter-spacing: 0.02em; }
        .eq-table td { padding: 6px 8px; color: var(--fg); border-bottom: 1px solid var(--border); white-space: nowrap; }
        .eq-table tbody tr:last-child td { border-bottom: 0; }
        .eq-table tbody tr:nth-child(even) { background: var(--surface); }
        .tr-done { background: var(--success-bg) !important; }
        .td-muted { color: var(--muted) !important; }

        .e-badge { display: inline-block; padding: 1px 7px; height: 20px; line-height: 18px; font-size: 11px; font-weight: 600; border-radius: 4px; white-space: nowrap; }
        .e-done { background: var(--success-bg); color: var(--success-fg); }
        .e-pending { background: oklch(50% 0.14 50 / 0.08); color: oklch(42% 0.12 50); }

        .spinner {
          width: 28px; height: 28px; margin: 0 auto;
          border: 3px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: eq-spin 0.7s linear infinite;
        }
        @keyframes eq-spin { to { transform: rotate(360deg); } }

        .eq-empty { padding: 40px 0; text-align: center; }
        .eq-empty p { color: var(--muted); font-size: 14px; margin: 0 0 4px; }
        .eq-empty-hint { font-size: 12px; color: var(--muted); }
        .eq-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 0; }
        .eq-loading p { font-size: 13px; color: var(--muted); margin: 0; }

        @media (max-width: 480px) {
          .eq-header { flex-direction: column; align-items: stretch; }
          .eq-actions .btn { flex: 1; text-align: center; }
          .eq-stats { gap: 8px; }
          .eq-stat-val { font-size: 17px; }
        }
      `}</style>
    </div>
  );
}

export default EvaluationQuery;
