import React, { useState, useEffect } from 'react';

const LEAVE_TYPES = [
  { value: '02045001', label: '求职' }, { value: '02045002', label: '实习' },
  { value: '02045003', label: '返家' }, { value: '02045004', label: '培训' },
  { value: '02045005', label: '旅游' }, { value: '02045006', label: '病假' },
  { value: '02045007', label: '事假' }, { value: '02045008', label: '留校' },
];
const VEHICLES = ['汽车', '火车', '飞机', '自行车', '其他'];
const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: `${i}点` }));
const PEOPLE_COUNT = Array.from({ length: 31 }, (_, i) => ({ value: String(i), label: `${i}人` }));
const DEFAULT_FORM = {
  leaveBeginDate: '', leaveBeginTime: '08', leaveEndDate: '', leaveEndTime: '18',
  leaveType: '02045003', leaveThing: '', outAddress: '', isTellRbl: '1', withNumNo: '0',
  jhrName: '', jhrPhone: '', outTel: '', outMoveTel: '', relation: '', outName: '',
  stuMoveTel: '', stuOtherTel: '', goDate: '', goTime: '08', goVehicle: '汽车',
  backDate: '', backTime: '18', backVehicle: '汽车',
};
function loadT(u) { try { return JSON.parse(localStorage.getItem(`leave_templates_${u}`)||'[]'); } catch { return []; } }
function saveT(u, t) { localStorage.setItem(`leave_templates_${u}`, JSON.stringify(t)); }
function calcDur(bD, bT, eD, eT) {
  if (!bD||!eD) return '';
  const b=new Date(bD+'T'+bT.padStart(2,'0')+':00'), e=new Date(eD+'T'+eT.padStart(2,'0')+':00');
  if (e<b) return '结束时间早于开始时间';
  const d=Math.floor((e-b)/86400000), h=Math.floor(((e-b)%86400000)/3600000);
  return `${d}天${h}小时`;
}
const sf = (s) => (f, v) => s(p => ({...p, [f]: v}));

function Sect({title,children}){return <div className="lr-section"><div className="lr-section-title">{title}</div>{children}</div>;}
function Row({children}){return <div className="lr-field-row">{children}</div>;}
function Col({label,children}){return <div className="lr-field-col"><label>{label}</label>{children}</div>;}
function D({v,onChange,type,p,w,s}){return <input type={type||'text'} value={v} onChange={e=>onChange(e.target.value)} placeholder={p} className="lr-input" style={{width:w||150,...s}}/>;}
function Sel({v,onChange,o}){return <select value={v} onChange={e=>onChange(e.target.value)} className="lr-select lr-select-sm">{o.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>;}

export default function LeaveRegistration({ account }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState('list');
  const [listData, setListData] = useState(null);
  const [form, setForm] = useState({...DEFAULT_FORM});
  const [xg2User, setXg2User] = useState('');
  const [xg2Pass, setXg2Pass] = useState('');
  const [rememberXg2, setRememberXg2] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTpl, setShowTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplFilter, setTplFilter] = useState('');

  const sets = sf(setForm);
  const duration = calcDur(form.leaveBeginDate, form.leaveBeginTime, form.leaveEndDate, form.leaveEndTime);

  useEffect(() => {
    if (xg2User) setTemplates(loadT(xg2User));
    try {
      const s = localStorage.getItem('xg2_saved_login');
      if (s) { const p=JSON.parse(s); setXg2User(p.username||''); setXg2Pass(p.password||''); setRememberXg2(true); }
    } catch(_) {}
  }, [xg2User]);

  // Login
  const handleLogin = async () => {
    if (!xg2User||!xg2Pass) { setError('请输入 xg2 学号和密码'); return; }
    setLoading(true); setError('');
    if (rememberXg2) localStorage.setItem('xg2_saved_login', JSON.stringify({username:xg2User,password:xg2Pass}));
    else localStorage.removeItem('xg2_saved_login');
    try {
      const r = await fetch('http://localhost:5000/api/xg2/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:xg2User,password:xg2Pass})});
      const d = await r.json();
      if (!d.success) { setError(d.message||'xg2 登录失败'); return; }
      setListData(d.data); setLoggedIn(true);
    } catch(e) { setError('网络错误: '+e.message); }
    finally { setLoading(false); }
  };

  // New
  const handleNew = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('http://localhost:5000/api/xg2/edit-form', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:xg2User})});
      const d = await r.json();
      if (!d.success) { setError(d.message||'获取编辑页失败'); return; }
      sets('leaveBeginDate', d.data.begin_date||'');
      sets('leaveEndDate', d.data.end_date||'');
      sets('goDate', d.data.begin_date||'');
      sets('backDate', d.data.end_date||'');
      setPage('form');
    } catch(e) { setError('网络错误: '+e.message); }
    finally { setLoading(false); }
  };

  // Submit
  const handleSubmit = async () => {
    setLoading(true); setError(''); setSuccessMsg('');
    try {
      const fields = {
        'Leave1$LeaveBeginDate':form.leaveBeginDate,'Leave1$LeaveBeginTime':form.leaveBeginTime,
        'Leave1$LeaveEndDate':form.leaveEndDate,'Leave1$LeaveEndTime':form.leaveEndTime,
        'Leave1$LeaveType':form.leaveType,'Leave1$LeaveThing':form.leaveThing,
        'Leave1$CTAreaBox1_ProvinceHid':'','Leave1$CTAreaBox1_CityHid':'','Leave1$CTAreaBox1_AreaHid':'',
        'Leave1$OutAddress':form.outAddress,'Leave1$IsTellRbl':form.isTellRbl,'Leave1$WithNumNo':form.withNumNo,
        'Leave1$JHRName':form.jhrName,'Leave1$JHRPhone':form.jhrPhone,
        'Leave1$OutTel':form.outTel,'Leave1$OutMoveTel':form.outMoveTel,
        'Leave1$Relation':form.relation,'Leave1$OutName':form.outName,
        'Leave1$StuMoveTel':form.stuMoveTel,'Leave1$StuOtherTel':form.stuOtherTel,
        'Leave1$GoDate':form.goDate,'Leave1$GoTime':form.goTime,'Leave1$GoVehicle':form.goVehicle,
        'Leave1$BackDate':form.backDate,'Leave1$BackTime':form.backTime,'Leave1$BackVehicle':form.backVehicle,
      };
      const r = await fetch('http://localhost:5000/api/xg2/submit', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:xg2User,form_fields:fields})});
      const d = await r.json();
      if (!d.success) { setError(d.message||'提交失败'); return; }
      setSuccessMsg('✅ '+d.message);
      setPage('done');
    } catch(e) { setError('网络错误: '+e.message); }
    finally { setLoading(false); }
  };

  // Templates
  const hSTpl = () => {
    if (!tplName.trim()) return;
    const u=[...templates,{id:Date.now(),name:tplName.trim(),fields:{...form},createdAt:new Date().toISOString()}];
    setTemplates(u); saveT(xg2User||'',u); setTplName('');
  };
  const hLTpl = (t) => { setForm({...DEFAULT_FORM,...t.fields}); setShowTpl(false); setSuccessMsg('✅ 已加载: '+t.name); setTimeout(()=>setSuccessMsg(''),2000); };
  const hDTpl = (id) => { const u=templates.filter(t=>t.id!==id); setTemplates(u); saveT(xg2User||'',u); };
  const ft = tplFilter ? templates.filter(t=>t.name.includes(tplFilter)) : templates;

  const tplDialog = (
    <div className="lr-overlay" onClick={()=>setShowTpl(false)}>
      <div className="lr-dialog" onClick={e=>e.stopPropagation()}>
        <h3>模板管理</h3>
        <div className="lr-dialog-row"><input value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="模板名称..." className="lr-input" style={{flex:1,height:28,fontSize:12}}/><button className="btn btn-primary" onClick={hSTpl} disabled={!tplName.trim()}>保存当前</button></div>
        <hr/><input value={tplFilter} onChange={e=>setTplFilter(e.target.value)} placeholder="搜索模板..." className="lr-input" style={{width:'100%',marginBottom:8,height:28,fontSize:12}}/>
        {ft.length===0&&<p className="lr-empty">暂无模板</p>}
        {ft.map(t=><div key={t.id} className="lr-tpl-row"><span className="lr-tpl-name">{t.name}</span><span className="lr-tpl-date">{new Date(t.createdAt).toLocaleDateString()}</span><button className="btn btn-text" onClick={()=>hLTpl(t)}>加载</button><button className="btn btn-text" style={{color:'var(--danger-fg)'}} onClick={()=>hDTpl(t.id)}>删除</button></div>)}
      </div>
    </div>
  );

  // === Login screen ===
  if (!loggedIn) return (
    <div className="lr-root">
      <div className="lr-login-card">
        <h2>节假日去向登记</h2>
        <p className="lr-login-desc">请输入 xg2 学工系统的账号密码</p>
        {error&&<div className="msg msg-error">✗ {error}</div>}
        <div className="lr-field-col"><label>xg2 学号</label><input value={xg2User} onChange={e=>setXg2User(e.target.value)} className="lr-input" placeholder="请输入学号"/></div>
        <div className="lr-field-col"><label>xg2 密码</label><input type="password" value={xg2Pass} onChange={e=>setXg2Pass(e.target.value)} className="lr-input" placeholder="请输入密码"/></div>
        <label className="lr-checkbox"><input type="checkbox" checked={rememberXg2} onChange={e=>setRememberXg2(e.target.checked)}/><span>记住 xg2 账号密码</span></label>
        <button className="btn btn-primary lr-btn-full" disabled={loading} onClick={handleLogin}>{loading?'登录中...':'开始登记'}</button>
      </div>
      <style>{CSS}</style>
    </div>
  );

  // === List page ===
  if (page === 'list') return (
    <div className="lr-root">
      <div className="lr-header"><h2>节假日去向登记</h2><div className="lr-header-actions"><span className="lr-status" style={{color:(listData?.status||'').includes('可以')?'var(--success-fg)':'var(--danger-fg)'}}>{listData?.status}</span></div></div>
      {successMsg&&<div className="msg msg-success">{successMsg}</div>}
      {error&&<div className="msg msg-error">✗ {error}</div>}
      <div className="lr-info-card">
        <div className="lr-info-title">{listData?.holiday_name}</div>
        <div className="lr-info-row"><span>放假：{listData?.begin_date} ~ {listData?.end_date}</span><span>登记截止：{listData?.leave_end_date}</span></div>
        {listData?.memo&&<div className="lr-info-memo">{listData.memo}</div>}
      </div>
      <button className="btn btn-primary" style={{marginBottom:12}} onClick={handleNew} disabled={loading}>{loading?'加载中...':'+ 新增去向登记'}</button>
      <div className="lr-section-title">历史记录</div>
      {listData?.records?.length>0?(
        <table className="lr-table"><thead><tr><th>节假日</th><th>去向时间</th><th>事由</th><th>去向地点</th></tr></thead>
        <tbody>{listData.records.map((r,i)=><tr key={r.id||i}><td>{r.holiday}</td><td style={{fontSize:11}}>{r.time_range}</td><td>{r.leave_type}</td><td style={{fontSize:11}}>{r.destination}</td></tr>)}</tbody></table>
      ):<p className="lr-empty">暂无记录</p>}
      <style>{CSS}</style>
    </div>
  );

  // === Form page ===
  if (page === 'form') return (
    <div className="lr-root">
      <div className="lr-header"><h2>新增去向登记</h2><div className="lr-header-actions"><button className="btn btn-outline" onClick={()=>setShowTpl(true)}>模板</button><button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>{loading?'提交中...':'提交'}</button></div></div>
      {successMsg&&<div className="msg msg-success">{successMsg}</div>}
      {error&&<div className="msg msg-error">✗ {error}</div>}
      {showTpl&&tplDialog}

      <Sect title="去向时间"><Row>开始 <D v={form.leaveBeginDate} onChange={v=>sets('leaveBeginDate',v)} type="date"/> <Sel v={form.leaveBeginTime} onChange={v=>sets('leaveBeginTime',v)} o={HOURS}/> 至 <D v={form.leaveEndDate} onChange={v=>sets('leaveEndDate',v)} type="date"/> <Sel v={form.leaveEndTime} onChange={v=>sets('leaveEndTime',v)} o={HOURS}/> {duration&&<span className="lr-duration">共 {duration}</span>}</Row></Sect>
      <Sect title="去向事由"><Row>{LEAVE_TYPES.map(lt=><label key={lt.value} className="lr-radio-label"><input type="radio" checked={form.leaveType===lt.value} onChange={()=>sets('leaveType',lt.value)}/>{lt.label}</label>)}</Row><Col label="事由说明"><textarea value={form.leaveThing} onChange={e=>sets('leaveThing',e.target.value)} className="lr-textarea" rows={3}/></Col></Sect>
      <Sect title="去向地点"><Row><D v={form.outAddress} onChange={v=>sets('outAddress',v)} p="省/市/区 + 详细地址" s={{flex:1}}/></Row></Sect>
      <Sect title="其他信息"><Row>已告知家长 <label className="lr-radio-label"><input type="radio" checked={form.isTellRbl==='1'} onChange={()=>sets('isTellRbl','1')}/>是</label><label className="lr-radio-label"><input type="radio" checked={form.isTellRbl==='0'} onChange={()=>sets('isTellRbl','0')}/>否</label> 同行人数 <Sel v={form.withNumNo} onChange={v=>sets('withNumNo',v)} o={PEOPLE_COUNT}/></Row></Sect>
      <Sect title="家长或监护人信息"><Row>姓名 <D v={form.jhrName} onChange={v=>sets('jhrName',v)} w={130}/> 联系电话 <D v={form.jhrPhone} onChange={v=>sets('jhrPhone',v)} w={130}/></Row></Sect>
      <Sect title="外出联系人"><Row>固定电话 <D v={form.outTel} onChange={v=>sets('outTel',v)} w={130}/> 移动电话 <D v={form.outMoveTel} onChange={v=>sets('outMoveTel',v)} w={130}/></Row><Row>本人关系 <D v={form.relation} onChange={v=>sets('relation',v)} w={130}/> 联系人姓名 <D v={form.outName} onChange={v=>sets('outName',v)} w={130}/></Row></Sect>
      <Sect title="本人联系方式"><Row>本人手机 <D v={form.stuMoveTel} onChange={v=>sets('stuMoveTel',v)} w={130}/> 其他方式 <D v={form.stuOtherTel} onChange={v=>sets('stuOtherTel',v)} w={130}/></Row></Sect>
      <Sect title="往返交通工具"><Row>去程 <D v={form.goDate} onChange={v=>sets('goDate',v)} type="date"/> <Sel v={form.goTime} onChange={v=>sets('goTime',v)} o={HOURS}/> 工具：{VEHICLES.map(v=><label key={v} className="lr-radio-label"><input type="radio" checked={form.goVehicle===v} onChange={()=>sets('goVehicle',v)}/>{v}</label>)}</Row><Row>返程 <D v={form.backDate} onChange={v=>sets('backDate',v)} type="date"/> <Sel v={form.backTime} onChange={v=>sets('backTime',v)} o={HOURS}/> 工具：{VEHICLES.map(v=><label key={v} className="lr-radio-label"><input type="radio" checked={form.backVehicle===v} onChange={()=>sets('backVehicle',v)}/>{v}</label>)}</Row></Sect>

      <div className="lr-bottom"><button className="btn btn-outline" onClick={()=>{setForm({...DEFAULT_FORM});}}>重置</button><button className="btn btn-outline" onClick={()=>setShowTpl(true)}>加载模板</button><button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>{loading?'提交中...':'提交'}</button></div>
      <style>{CSS}</style>
    </div>
  );

  // === Done page ===
  return (
    <div className="lr-root">
      <div className="lr-done"><div className="lr-done-icon">✅</div><h2>登记已提交</h2><p>{successMsg||'节假日去向登记已成功提交'}</p>
        <button className="btn btn-primary" onClick={()=>{setPage('list'); setForm({...DEFAULT_FORM});}}>返回列表</button>
        <button className="btn btn-outline" style={{marginLeft:8}} onClick={()=>{setForm({...DEFAULT_FORM}); handleNew();}}>再新增一条</button>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.lr-root{max-width:900px;margin:0 auto}
.lr-login-card{max-width:380px;margin:40px auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px}
.lr-login-card h2{font-size:18px;font-weight:600;margin:0 0 4px}
.lr-login-desc{font-size:13px;color:var(--muted);margin:0 0 20px}
.lr-btn-full{width:100%;height:40px}
.lr-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px}
.lr-header h2{font-size:17px;font-weight:600;margin:0}
.lr-header-actions{display:flex;gap:8px;align-items:center}
.lr-status{font-size:13px;font-weight:600;padding:3px 10px;border-radius:4px;background:var(--accent-bg)}
.lr-info-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 18px;margin-bottom:16px}
.lr-info-title{font-size:15px;font-weight:600;margin-bottom:6px;color:var(--accent)}
.lr-info-row{display:flex;gap:24px;font-size:13px;color:var(--muted)}
.lr-info-memo{font-size:12px;color:var(--muted);margin:6px 0;line-height:1.5}
.lr-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:8px}
.lr-section-title{font-size:13px;font-weight:600;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border);color:var(--accent)}
.lr-field-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.lr-field-row label{font-size:12px;color:var(--muted);white-space:nowrap;flex-shrink:0}
.lr-field-col{margin-bottom:6px}
.lr-field-col label{display:block;font-size:12px;color:var(--muted);margin-bottom:2px}
.lr-input,.lr-select{font:13px/1.4 var(--font);color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:4px;outline:none;padding:4px 7px;height:28px}
.lr-input:focus,.lr-select:focus{border-color:var(--accent)}
.lr-select{cursor:pointer}
.lr-select-sm{width:60px}
.lr-textarea{width:100%;resize:vertical;font:13px/1.4 var(--font);color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:4px;outline:none;padding:5px 7px}
.lr-radio-label{display:inline-flex;align-items:center;gap:2px;cursor:pointer;font-size:13px;padding:1px 5px;border-radius:4px}
.lr-radio-label input{accent-color:var(--accent)}
.lr-duration{font-size:12px;color:var(--accent);font-weight:500}
.lr-bottom{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;padding-bottom:20px}

.lr-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
.lr-table th{padding:6px 8px;text-align:left;font-weight:500;color:var(--muted);background:var(--surface);border-bottom:1px solid var(--border)}
.lr-table td{padding:5px 8px;border-bottom:1px solid var(--border)}
.lr-table tbody tr:nth-child(even){background:var(--surface)}

.lr-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100;display:flex;align-items:center;justify-content:center}
.lr-dialog{background:var(--surface);border-radius:var(--radius);width:420px;max-height:70vh;padding:20px;overflow-y:auto}
.lr-dialog h3{font-size:15px;font-weight:600;margin:0 0 12px}
.lr-dialog hr{border:none;border-top:1px solid var(--border);margin:10px 0}
.lr-dialog-row{display:flex;gap:8px;align-items:center}
.lr-tpl-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)}
.lr-tpl-name{flex:1;font-size:13px;font-weight:500}
.lr-tpl-date{font-size:11px;color:var(--muted)}
.lr-empty{font-size:13px;color:var(--muted);text-align:center;padding:16px 0}
.lr-checkbox{display:flex;align-items:center;gap:6px;margin-bottom:14px;cursor:pointer;font-size:13px;color:var(--muted)}
.lr-checkbox input{accent-color:var(--accent);width:15px;height:15px;cursor:pointer}
.lr-done{text-align:center;padding:60px 20px}
.lr-done-icon{font-size:48px;margin-bottom:12px}
.lr-done h2{font-size:20px;font-weight:600;margin:0 0 6px}
.lr-done p{font-size:14px;color:var(--muted);margin:0 0 20px}
`;
