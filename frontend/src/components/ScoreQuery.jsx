import React, { useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  Text,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tag,
  Spinner,
  makeStyles,
  tokens
} from '@fluentui/react-components';
import { Dropdown, DropdownMenuItemType } from '@fluentui/react';

const useStyles = makeStyles({
  scoreQueryCard: {
    width: '100%',
    border: '1px solid #e0e0e0',
    borderRadius: '0',
    boxShadow: 'none'
  },
  cardHeaderContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%'
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
  statsContainer: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px'
  },
  statCard: {
    flex: 1,
    textAlign: 'center'
  },
  filterContainer: {
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap'
  },
  termSelect: {
    width: '180px'
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
  }
});

function ScoreQuery({ account }) {
  console.log('ScoreQuery component rendered');
  console.log('Account prop:', account);
  const styles = useStyles();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [scores, setScores] = useState([]);
  const [terms, setTerms] = useState(['all']);
  const [selectedTerm, setSelectedTerm] = useState('all');
  const [showFullData, setShowFullData] = useState(false);

  const fetchScores = async () => {
    if (!account?.username || !account?.password) {
      setError('账号信息不完整');
      return;
    }

    setLoading(true);
    setError('');
    setShowSuccess(false);

    try {
      const response = await fetch('http://localhost:5000/api/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: account.username,
          password: account.password,
          name: account.name
        })
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success) {
          const scoreData = data.data.scores;
          
          const transformedScores = scoreData.map((score, index) => ({
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

          const termSet = new Set();
          transformedScores.forEach(score => termSet.add(score.term));
          setTerms(['all', ...Array.from(termSet).sort().reverse()]);

          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
          }, 3000);
        } else {
          setError(data.message || '获取成绩失败');
        }
      } else {
        setError('网络错误，请稍后重试');
      }
    } catch (err) {
      setError(`获取成绩失败: ${err.message || '网络错误'}`);
    } finally {
      setLoading(false);
    }
  };

  console.log('selectedTerm:', selectedTerm);
  console.log('scores:', scores);
  const filteredScores = selectedTerm === 'all' 
    ? scores 
    : scores.filter(score => score.term === selectedTerm);
  console.log('filteredScores:', filteredScores);

  const totalCredits = filteredScores.reduce((sum, score) => sum + score.credit, 0).toFixed(2);

  const averageGpa = () => {
    const validScores = filteredScores.filter(score => score.gpa > 0);
    if (validScores.length === 0) return '0.00';
    const totalGpa = validScores.reduce((sum, score) => sum + score.gpa, 0);
    return (totalGpa / validScores.length).toFixed(2);
  };

  const getScoreColor = (score) => {
    if (typeof score === 'string') {
      if (score === '优秀' || score === '良好' || score === '及格') {
        return 'success';
      } else if (score === '不及格') {
        return 'error';
      }
      return 'default';
    }
    
    const scoreNum = parseFloat(score);
    if (isNaN(scoreNum)) return 'default';
    if (scoreNum >= 90) return 'success';
    if (scoreNum >= 80) return 'primary';
    if (scoreNum >= 60) return 'default';
    return 'error';
  };

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Text variant="large" weight="semibold">成绩查询</Text>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Text variant="small" color="secondary">
            💡 如无法获取成绩，请先完成"教学评价"
          </Text>
          <Button
            variant="primary"
            disabled={loading}
            onClick={fetchScores}
            size="small"
          >
            {loading ? '获取中...' : '获取成绩'}
          </Button>
        </div>
      </div>
        {showSuccess && (
          <div className={styles.successAlert}>
            <Text variant="medium" color="success">
              ✓ 成绩获取成功！
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

        {scores.length > 0 && (
          <div className={styles.statsContainer}>
            <Card>
              <div style={{ padding: '16px' }}>
                <Text variant="small" color="secondary">总学分</Text>
                <Text variant="xxLarge" weight="semibold">{totalCredits}</Text>
              </div>
            </Card>
            <Card>
              <div style={{ padding: '16px' }}>
                <Text variant="small" color="secondary">平均绩点</Text>
                <Text variant="xxLarge" weight="semibold">{averageGpa()}</Text>
              </div>
            </Card>
          </div>
        )}

        {scores.length > 0 && (
          <div className={styles.filterContainer}>
            <Text variant="small" weight="medium" className={styles.filterLabel}>学期筛选</Text>
            <Dropdown
              placeholder="选择学期"
              selectedKey={selectedTerm}
              onChange={(event, option) => {
                if (option) {
                  setSelectedTerm(option.key);
                }
              }}
              options={terms.map((term) => ({
                key: term,
                text: term === 'all' ? '全部学期' : term
              }))}
              styles={{
                dropdown: {
                  width: '180px'
                }
              }}
            />
            <Button
              variant="outline"
              size="small"
              onClick={() => setShowFullData(!showFullData)}
            >
              {showFullData ? '隐藏完整数据' : '显示完整数据'}
            </Button>
          </div>
        )}

        {scores.length > 0 && (
          <div className={styles.tableContainer}>
            <Table>
              <TableHeader style={{ backgroundColor: '#f1f1f1', borderBottom: '1px solid #e0e0e0' }}>
                <TableRow>
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '50px' }}>序号</TableHeaderCell>
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>学期</TableHeaderCell>
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>课程编号</TableHeaderCell>
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>课程名称</TableHeaderCell>
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '6px', width: '60px' }}>成绩</TableHeaderCell>
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '6px', width: '50px' }}>学分</TableHeaderCell>
                  {showFullData && <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '60px' }}>总学时</TableHeaderCell>}
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px', width: '60px' }}>绩点</TableHeaderCell>
                  {showFullData && <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>考核方式</TableHeaderCell>}
                  <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>考试性质</TableHeaderCell>
                  {showFullData && <TableHeaderCell style={{ fontSize: '12px', fontWeight: '600', padding: '8px' }}>课程属性</TableHeaderCell>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScores.map((score, index) => (
                  <TableRow key={score.id} style={{ 
                    backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9',
                    borderBottom: '1px solid #e0e0e0'
                  }}>
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '50px' }}>{score.id}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px' }}>{score.term}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px' }}>{score.courseCode}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '8px' }}>{score.courseName}</TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '6px', width: '60px' }}>
                      {typeof score.score === 'string' ? (
                        score.score === '不及格' ? (
                          <span style={{ color: 'red', fontWeight: 'bold', backgroundColor: '#f8d7da', padding: '2px 6px', borderRadius: '4px' }}>
                            {score.score}
                          </span>
                        ) : (
                          <span style={{ color: '#495057', backgroundColor: '#e9ecef', padding: '2px 6px', borderRadius: '4px' }}>
                            {score.score}
                          </span>
                        )
                      ) : (
                        parseFloat(score.score) < 60 ? (
                          <span style={{ color: 'red', fontWeight: 'bold', backgroundColor: '#f8d7da', padding: '2px 6px', borderRadius: '4px' }}>
                            {score.score}
                          </span>
                        ) : (
                          <span style={{ color: '#495057', backgroundColor: '#e9ecef', padding: '2px 6px', borderRadius: '4px' }}>
                            {score.score}
                          </span>
                        )
                      )}
                    </TableCell>
                    <TableCell style={{ fontSize: '12px', padding: '6px', width: '50px' }}>{score.credit}</TableCell>
                    {showFullData && <TableCell style={{ fontSize: '12px', padding: '8px', width: '60px' }}>{score.hours}</TableCell>}
                    <TableCell style={{ fontSize: '12px', padding: '8px', width: '60px' }}>{score.gpa}</TableCell>
                    {showFullData && <TableCell style={{ fontSize: '12px', padding: '8px' }}>{score.assessment}</TableCell>}
                    <TableCell style={{ fontSize: '12px', padding: '8px' }}>{score.nature}</TableCell>
                    {showFullData && <TableCell style={{ fontSize: '12px', padding: '8px' }}>{score.attribute}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && scores.length === 0 && (
          <div className={styles.emptyState}>
            <Text variant="large" weight="semibold">
              暂无成绩数据
            </Text>
            <Text variant="medium" color="secondary">
              点击上方 '获取成绩' 按钮获取成绩
            </Text>
          </div>
        )}

        {loading && (
          <div className={styles.loadingState}>
            <Spinner size="large" />
            <Text variant="medium" className={styles.loadingText}>
              正在获取成绩...
            </Text>
          </div>
        )}
    </div>
  );
}

export default ScoreQuery;