"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULTS = [
  {id:"google",name:"Google Gemini — FREE",model:"gemini-2.5-flash",placeholder:"AIza...",enabled:false,keyUrl:"https://aistudio.google.com/app/apikey",free:true},
  {id:"groq",name:"Groq — FREE",model:"openai/gpt-oss-20b",placeholder:"gsk_...",enabled:false,keyUrl:"https://console.groq.com/keys",free:true},
  {id:"openrouter",name:"OpenRouter — FREE",model:"openrouter/free",placeholder:"sk-or-...",enabled:false,keyUrl:"https://openrouter.ai/settings/keys",free:true}
];

function loadProviders(){
  if(typeof window==="undefined") return DEFAULTS;
  try{
    const saved=JSON.parse(localStorage.getItem("asf.providers")||"null");
    if(!saved?.length) return DEFAULTS;
    return DEFAULTS.map(d=>{
      const p=saved.find(x=>x.id===d.id);
      return p ? {...d,...p,keyUrl:d.keyUrl,free:true} : d;
    });
  }catch{return DEFAULTS}
}

export default function Home(){
  const [tab,setTab]=useState("workspace");
  const [providers,setProviders]=useState(loadProviders);
  const [selected,setSelected]=useState("auto");
  const [prompt,setPrompt]=useState("");
  const [messages,setMessages]=useState([]);
  const [logs,setLogs]=useState([]);
  const [busy,setBusy]=useState(false);
  const [project,setProject]=useState("Untitled Project");
  const [preview,setPreview]=useState("");
  const [notice,setNotice]=useState("");
  const [models,setModels]=useState({});
  const [loadingModels,setLoadingModels]=useState({});
  const [connection,setConnection]=useState({});

  useEffect(()=>localStorage.setItem("asf.providers",JSON.stringify(providers)),[providers]);

  const enabled=useMemo(()=>providers.filter(p=>p.free&&p.enabled&&p.key),[providers]);

  function update(id,patch){setProviders(ps=>ps.map(p=>p.id===id?{...p,...patch}:p))}
  function toggle(id){setProviders(ps=>ps.map(p=>p.id===id?{...p,enabled:!p.enabled}:p))}
  function clearKey(id){update(id,{key:"",enabled:false});setModels(ms=>({...ms,[id]:[]}));setNotice("Đã xoá API key khỏi trình duyệt.");}

  async function testProvider(p){
    if(!p.key){setNotice("Nhập API key trước.");return}
    setConnection(x=>({...x,[p.id]:{status:"testing",message:"Đang kiểm tra..."}}));
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"test",provider:p.id,key:p.key,model:p.model})});
      const data=await r.json();
      setConnection(x=>({...x,[p.id]:data.ok?{status:"connected",message:"Đã kết nối"}:{status:"error",message:data.error||"Kết nối thất bại"}}));
      setNotice(data.ok?"✓ "+p.name+" kết nối OK":("✕ "+p.name+": "+(data.error||"Không kết nối được")));
    }catch(e){setNotice("✕ Lỗi mạng khi kiểm tra "+p.name)}
  }

  async function loadModels(p){
    if(!p.key){setNotice("Nhập API key trước khi tải model.");return}
    setLoadingModels(x=>({...x,[p.id]:true}));
    setNotice("Đang tải danh sách model của "+p.name+"...");
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"models",provider:p.id,key:p.key})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||"Không tải được model.");
      setModels(x=>({...x,[p.id]:data.models||[]}));
      setNotice("✓ "+p.name+": đã tải "+(data.models?.length||0)+" model.");
    }catch(e){
      setNotice("✕ "+p.name+": "+e.message);
    }finally{
      setLoadingModels(x=>({...x,[p.id]:false}));
    }
  }

  async function run(){
    if(!prompt.trim()||busy)return;
    if(!enabled.length){setNotice("Chưa có AI provider nào được bật và có key.");setTab("settings");return}
    const user=prompt.trim(); setPrompt(""); setMessages(m=>[...m,{role:"user",content:user}]); setBusy(true);
    setLogs(l=>[...l,"Router: bắt đầu xử lý yêu cầu..."]);
    try{
      const payload={action:"chat",prompt:user,providers:enabled.map(p=>({id:p.id,key:p.key,model:p.model})),selected};
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const data=await r.json();
      if(data.logs?.length)setLogs(l=>[...l,...data.logs]);
      if(!r.ok) throw new Error(data.error||"AI request failed");
      setMessages(m=>[...m,{role:"assistant",content:data.text||"Không có nội dung trả về."}]);
    }catch(e){
      setMessages(m=>[...m,{role:"assistant",content:"Lỗi: "+e.message}]);
      setLogs(l=>[...l,"Router: thất bại — "+e.message]);
    }finally{setBusy(false)}
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo">AI</div><div><b>AI Software Factory</b><span>Build • Review • Ship</span></div></div>
      <div className="nav">
        <button className={tab==="workspace"?"active":""} onClick={()=>setTab("workspace")}>⌘ Workspace</button>
        <button className={tab==="settings"?"active":""} onClick={()=>setTab("settings")}>⚙ AI Providers</button>
      </div>
      <div className="side-foot">Keys are stored locally in this browser. Never commit API keys to GitHub.</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="status"><span className="dot"/>{enabled.length} provider sẵn sàng</div><div className="row"><button className="btn" onClick={()=>setTab("settings")}>Manage AI</button></div></header>
      <div className="content">
        {tab==="workspace"?<section className="workspace">
          <div className="hero"><div><div className="eyebrow">AI orchestration workspace</div><h1>Build your software with multiple AIs.</h1><p>Nhập yêu cầu. Router sẽ ưu tiên provider bạn chọn, rồi fallback sang provider khác khi gặp lỗi hoặc giới hạn.</p></div><button className="btn primary" onClick={()=>setTab("settings")}>+ Add AI</button></div>
          <div className="grid">
            <div className="card chat">
              <div className="row" style={{justifyContent:"space-between"}}><div><h2>Build conversation</h2><div className="muted">{project}</div></div><input value={project} onChange={e=>setProject(e.target.value)} style={{width:190,background:"#080d16",border:"1px solid #263047",color:"#eef2ff",padding:"8px 10px",borderRadius:7}}/></div>
              <div className="messages">{messages.length?messages.map((m,i)=><div key={i} className={"msg "+(m.role==="user"?"user":"ai")}><b>{m.role==="user"?"You":"AI Router"}</b><div>{m.content}</div></div>):<div className="empty">Mô tả app/web bạn muốn xây ở ô bên dưới.<br/>Ví dụ: “Tạo dashboard quản lý đơn hàng có đăng nhập, tìm kiếm và biểu đồ.”</div>}</div>
              <div className="composer">
                <div className="field" style={{marginTop:0}}><label>Router mode</label><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="auto">Auto fallback</option>{enabled.map(p=><option key={p.id} value={p.id}>{p.name} — {p.model||"default"}</option>)}</select></div>
                <div className="field"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")run()}} placeholder="Bạn muốn xây gì? Ctrl/Cmd + Enter để chạy..."/></div>
                <div className="row" style={{justifyContent:"space-between"}}><span className="muted">{busy?"Router đang gọi AI...":"API keys chỉ được gửi khi bạn bấm Build."}</span><button className="btn primary" disabled={busy} onClick={run}>{busy?"Đang chạy…":"Build with AI"}</button></div>
              </div>
            </div>
            <div className="card">
              <h2>Live project</h2><div className="muted">Preview / generated output</div>
              <div className="field"><label>Preview URL</label><input value={preview} onChange={e=>setPreview(e.target.value)} placeholder="https://..."/></div>
              <div className="review"><div className="metric"><b>{enabled.length}</b><span>AI providers</span></div><div className="metric"><b>{messages.length}</b><span>Messages</span></div><div className="metric"><b>{logs.length}</b><span>Router logs</span></div></div>
              <h2 style={{marginTop:22}}>Pipeline logs</h2><div className="logs">{logs.length?logs.slice(-12).map((x,i)=><div className="log" key={i}>{x}</div>):<div className="log">Router idle.</div>}</div>
            </div>
          </div>
        </section>:<section className="settings">
          <div className="hero"><div><div className="eyebrow">Settings</div><h1>AI Providers</h1><p>Nhập key trực tiếp trong app. Key được lưu trong localStorage của trình duyệt hiện tại và không được ghi vào GitHub.</p></div><button className="btn" onClick={()=>setNotice("FREE ONLY: Gemini, Groq, Cerebras và OpenRouter. Không dùng API trả phí.")}>+ Custom provider</button></div>
          {notice&&<div className="card" style={{marginBottom:14}}>{notice}</div>}
          <div className="card"><h2>Provider pool</h2><div className="muted">FREE ONLY — Router chỉ dùng provider có free tier và tự chuyển khi nguồn bị giới hạn.</div>
            <div className="providers">{providers.map(p=><div className="provider" key={p.id}>
              <div className="provider-head"><div><div className="provider-name">{p.name} <span className="pill ok">FREE</span></div><span className="pill">{p.id}</span></div><button className={"switch "+(p.enabled?"on":"")} onClick={()=>toggle(p.id)} aria-label="toggle"/></div>
              <div className="field"><label>Model</label><select value={p.model||""} onChange={e=>update(p.id,{model:e.target.value})}>
                {models[p.id]?.length?<>{models[p.id].map(m=><option key={m.id} value={m.id}>{m.name}{m.id!==m.name?" — "+m.id:""}</option>)}</>:<option value={p.model||""}>{p.model||"Chưa tải model"}</option>}
              </select></div>
              {models[p.id]?.length>0&&<div className="muted" style={{marginTop:-7,marginBottom:10}}>Đã tải {models[p.id].length} model. Chọn trực tiếp từ danh sách.</div>}
              <div className="field"><label>API key</label><input type="password" value={p.key||""} onChange={e=>update(p.id,{key:e.target.value})} placeholder={p.placeholder}/></div>
              <div className="provider-actions"><button className="btn" onClick={()=>loadModels(p)} disabled={loadingModels[p.id]}>{loadingModels[p.id]?"Đang tải…":"↻ Tải models"}</button><button className="btn" onClick={()=>testProvider(p)}>Test connection</button><button className="btn" onClick={()=>clearKey(p.id)}>Clear key</button><a className="btn primary" href={p.keyUrl} target="_blank" rel="noopener noreferrer">Lấy API key ↗</a>{connection[p.id]&&<span className={"connection "+connection[p.id].status}>{connection[p.id].status==="connected"?"● Đã kết nối":connection[p.id].status==="testing"?"○ Đang kiểm tra":"× "+connection[p.id].message}</span>}</div>
            </div>)}</div>
          </div>
        </section>}
      </div>
    </main>
  </div>
}
