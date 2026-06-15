import React, { useState } from 'react';
import {
  Button,
  Card,
  Text,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Spinner,
  makeStyles,
  tokens
} from '@fluentui/react-components';

const useStyles = makeStyles({
  pageContainer: {
    padding: '16px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  statsContainer: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px'
  },
  statCard: {
    flex: 1,
    textAlign: 'center'
  },
  successAlert: {
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#e6f4ea',
    borderRadius: '0',
    border: '1px solid #c3e6cb'
  },
  errorAlert: {
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#f8d7da',
    borderRadius: '0',
    border: '1px solid #f5c6cb'
  },
  infoAlert: {
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#cce5ff',
    borderRadius: '0',
    border: '1px solid #b8daff'
  },
  tableContainer: {
    marginTop: '16px',
    overflowX: 'auto',
    border: '1px solid #e0e0e0'
  },
  emptyState: {
    padding: '40px 0',
    textAlign: 'center'
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '40px 0'
  },
  loadingText: {
    marginTop: '4px',
    fontSize: '12px'
  },
  progressContainer: {
    marginTop: '8px',
    marginBottom: '8px'
  }
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
    if (!account?.username || !account?.password) {
      setError('账号信息不完整');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    setShowSuccess(false);

    try {
      const response = await fetch('http://localhost:5000/api/evaluation/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: account.username,
          password: account.password
        })
      });

      const data = await response.json();

      if (data.success) {
        setTeachers(data.data.teachers);
        setInfo(`共 ${data.data.total} 位教师，已提交 ${data.data.submitted} 位，待评 ${data.data.unsubmitted} 位`);
      } else {
        setError(data.message || '获取评价列表失败');
      }
    } catch (err) {
      setError(`网络错误: ${err.message || '连接失败'}`);
    } finally {
      setLoading(false);
    }
  };

  const submitAll = async () => {
    const unsubmitted = teachers.filter(t => t.submitted !== '是');
    if (unsubmitted.length === 0) {
      setInfo('没有需要评价的教师');
      return;
    }

    if (!window.confirm(
      `将对 ${unsubmitted.length} 位教师进行自动评教：\n` +
      `• 前 9 道题选"非常满意"\n` +
      `• 最后 1 道题选"满意"\n` +
      `• 建议留空\n\n确认开始？`
    )) {
      return;
    }

    setSubmitting(true);
    setError('');
    setInfo('');
    setShowSuccess(false);

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < unsubmitted.length; i++) {
      const t = unsubmitted[i];
      setProgress(`[${i + 1}/${unsubmitted.length}] ${t.teacher_name} ...`);

      try {
        const response = await fetch('http://localhost:5000/api/evaluation/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: account.username,
            password: account.password,
            teacher: t,
            do_submit: true
          })
        });

        const data = await response.json();
        if (data.success) {
          ok++;
          // 立即更新列表中该行状态
          setTeachers(prev => prev.map(teacher =>
            teacher.teacher_id === t.teacher_id && teacher.url === t.url
              ? { ...teacher, submitted: '是' }
              : teacher
          ));
        } else {
          fail++;
          console.error(`评教失败: ${t.teacher_name} - ${data.message}`);
        }
      } catch (err) {
        fail++;
        console.error(`网络错误: ${t.teacher_name} - ${err.message}`);
      }
    }

    setProgress('');
    setSubmitting(false);

    if (fail === 0) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } else {
      setError(`${ok} 位提交成功, ${fail} 位失败`);
    }
  };

  const unsubmittedCount = teachers.filter(t => t.submitted !== '是').length;
  const submittedCount = teachers.length - unsubmittedCount;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.header}>
        <Text variant="large" weight="semibold">教学评价</Text>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            appearance="primary"
            disabled={loading || submitting}
            onClick={fetchTeachers}
            size="small"
          >
            {loading ? '获取中...' : '刷新列表'}
          </Button>
          <Button
            appearance="primary"
            disabled={loading || submitting || unsubmittedCount === 0}
            onClick={submitAll}
            size="small"
            style={{ backgroundColor: '#107c10' }}
          >
            {submitting ? '评教中...' : `一键评教 (${unsubmittedCount})`}
          </Button>
        </div>
      </div>

      {showSuccess && (
        <div className={styles.successAlert}>
          <Text variant="medium" color="success">
            ✓ 评教完成！所有教师已提交。
          </Text>
        </div>
      )}

      {error && (
        <div className={styles.errorAlert}>
          <Text variant="medium" color="error">
            ✗ {error}
          </Text>
        </div>
      )}

      {info && !error && (
        <div className={styles.infoAlert}>
          <Text variant="medium">
            ℹ {info}
          </Text>
          {submitting && (
            <Text variant="small" style={{ marginTop: '8px' }}>
              {progress}
            </Text>
          )}
        </div>
      )}

      {teachers.length > 0 && (
        <div className={styles.statsContainer}>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="small" color="secondary">总人数</Text>
              <Text variant="xxLarge" weight="semibold">{teachers.length}</Text>
            </div>
          </Card>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="small" color="secondary">已提交</Text>
              <Text variant="xxLarge" weight="semibold" style={{ color: '#107c10' }}>{submittedCount}</Text>
            </div>
          </Card>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="small" color="secondary">待评</Text>
              <Text variant="xxLarge" weight="semibold" style={{ color: '#d83b01' }}>{unsubmittedCount}</Text>
            </div>
          </Card>
        </div>
      )}

      {teachers.length > 0 && (
        <div className={styles.tableContainer}>
          <Table>
            <TableHeader style={{ backgroundColor: '#f1f1f1', borderBottom: '1px solid #e0e0e0' }}>
              <TableRow>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '50px' }}>序号</TableHeaderCell>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '80px' }}>教师编号</TableHeaderCell>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>教师姓名</TableHeaderCell>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>所属院系</TableHeaderCell>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '100px' }}>评教类别</TableHeaderCell>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '80px' }}>总评分</TableHeaderCell>
                <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '80px' }}>状态</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((teacher, index) => {
                const isSubmitted = teacher.submitted === '是';
                return (
                  <TableRow key={`${teacher.teacher_id}-${index}`} style={{
                    backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9',
                    borderBottom: '1px solid #e0e0e0'
                  }}>
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '50px' }}>{teacher.seq}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '80px' }}>{teacher.teacher_id}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px' }}>{teacher.teacher_name}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {teacher.dept}
                    </TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '100px' }}>{teacher.eval_type}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '80px' }}>{teacher.total_score}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '80px' }}>
                      {isSubmitted ? (
                        <span style={{ color: '#107c10', fontWeight: 'bold' }}>✓ 已提交</span>
                      ) : (
                        <span style={{ color: '#d83b01', fontWeight: 'bold' }}>待评</span>
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
          <Text variant="large" weight="semibold">暂无评价数据</Text>
          <Text variant="medium" color="secondary">
            点击上方 '刷新列表' 按钮获取待评列表
          </Text>
        </div>
      )}

      {loading && (
        <div className={styles.loadingState}>
          <Spinner size="large" />
          <Text variant="medium" className={styles.loadingText}>
            正在获取评价列表...
          </Text>
        </div>
      )}
    </div>
  );
}

export default EvaluationQuery;
