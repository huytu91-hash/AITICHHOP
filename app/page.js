"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULTS=[
  {id:"google",name:"Google Gemini — FREE",model:"gemini-2.5-flash",placeholder:"AIza...",enabled:false,keyUrl:"https://aistudio.google.com/app/apikey",free:true},
  {id:"groq",name:"Groq — FREE",model:"openai/gpt-oss-20b",placeholder:"gsk_...",enabled:false,keyUrl:"https://console.groq.com/keys",free:true},
  {id:"openrouter",name:"OpenRouter — FREE",model:"openrouter/free",placeholder:"sk-or-...",enabled:false,keyUrl:"https://openrouter.ai/settings/keys",free:true}
];

function loadProviders(){
  if(typeof window==="undefined") return DEFAULTS;
  try{
    const saved=JSON.parse(localStorage.getItem("asf.providers")||"null");
    if(!saved?.length) return DEFAULTS;
    return DEFAULTS.map(d=>{const p=saved.find(x=>x.id===d.id);return p?{...d,...p,keyUrl:d.keyUrl,free:true}:d});
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
  const [previewHtml,setPreviewHtml]=useState("");
  const [previewType,setPreviewType]=useState("universal");
  const [platform,setPlatform]=useState("web");
  const [notice,setNotice]=useState("");
  const [models,setModels]=useState({});
  const [loadingModels,setLoadingModels]=useState({});
  const [connection,setConnection]=useState({});
  const [projects,setProjects]=useState(()=>{try{return JSON.parse(localStorage.getItem("asf.projects")||"[]")}catch{return []}});
  const [activeProject,setActiveProject]=useState("");
  const [chatSessions,setChatSessions]=useState(()=>{try{return JSON.parse(localStorage.getItem("asf.chats")||"[]")}catch{return []}});
  const [activeChat,setActiveChat]=useState("");
  const [mediaType,setMediaType]=useState("image");
  const [mediaPrompt,setMediaPrompt]=useState("");
  const [mediaHistory,setMediaHistory]=useState(()=>{try{return JSON.parse(localStorage.getItem("asf.media")||"[]")}catch{return []}});
  const [mediaBusy,setMediaBusy]=useState(false);
  const [pipeline,setPipeline]=useState(["idle","idle","idle","idle"]);
  const [approval,setApproval]=useState(null);
  const [previewError,setPreviewError]=useState("");
  const previewRepairing=useRef(false);
  const messagesRef=useRef(null);
  const stickToBottomRef=useRef(true);

  useEffect(()=>{
    const el=messagesRef.current;
    if(!el||!stickToBottomRef.current)return;
    requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight});
  },[messages,busy]);

  function handleMessagesScroll(){
    const el=messagesRef.current;
    if(!el)return;
    const distance=el.scrollHeight-el.scrollTop-el.clientHeight;
    stickToBottomRef.current=distance<70;
  }
  function instrumentPreview(html){
    if(!html)return html;
    const bridge = '<script>(function(){window.addEventListener("error",function(e){try{parent.postMessage({source:"asf-preview-error",message:e.message||"JavaScript error"},"*")}catch(_){}});window.addEventListener("unhandledrejection",function(e){try{parent.postMessage({source:"asf-preview-error",message:String(e.reason?.message||e.reason||"Unhandled promise rejection")},"*")}catch(_){}})})();<\\/script>';
    return html.replace(/<\\/body>/i,bridge+"<\\/body>");
  }

  function jumpToLatest(){
    const el=messagesRef.current;
    if(!el)return;
    stickToBottomRef.current=true;
    el.scrollTo({top:el.scrollHeight,behavior:"smooth"});
  }
  function localGamePlan(user){
    return `KỊCH BẢN GAME — CHỜ DUYỆT

Mục tiêu: game giáo dục, thao tác đơn giản cho trẻ 5 tuổi.

1. Gameplay
• Một câu hỏi/nhiệm vụ xuất hiện trên màn hình.
• Bé chọn bằng cách chạm vào đáp án lớn, rõ ràng.
• Đúng → hiệu ứng vui + đọc lời khen + cộng sao.
• Sai → báo nhẹ nhàng, chỉ ra đáp án đúng và cho chơi lại.

2. Nội dung học tập
• Ưu tiên nhận biết hình, màu, số và đếm; có thể mở rộng chữ cái/con vật theo yêu cầu.
• Mỗi lượt có câu hỏi mới, tăng nhẹ độ khó.
• Có tiến độ và điểm/số sao để bé biết mình đang làm tốt.

3. Giao diện
• Màu sắc thân thiện, chữ lớn, nút lớn, phù hợp màn hình cảm ứng.
• Không dùng thao tác kéo-thả bằng chuột làm cơ chế chính.
• Có âm thanh/đọc tiếng Việt bằng SpeechSynthesis nếu trình duyệt cho phép.

4. Cần kiểm tra trước khi build
• Đáp án đúng phải được đánh dấu đúng tuyệt đối.
• Không để trạng thái câu trước làm sai câu sau.
• Nút tiếp theo/reset phải hoạt động.
• Có phản hồi đúng/sai rõ ràng.

5. Phiên bản đầu
• Build thành một game HTML tự chạy trong Live Preview, không cần API trả phí.
• Sau khi mày duyệt kịch bản này, Factory mới bắt đầu Build.`;
  }

  async function requestGamePlan(user,history){
    setPipeline(["done","running","idle","idle"]);
    const fallback=localGamePlan(user);
    if(!enabled.length){
      setMessages(m=>[...m,{role:"assistant",content:fallback}]);
      setApproval({prompt:user,plan:fallback});
      setNotice("✓ Đã lên kịch bản. Chưa build — chờ mày đồng ý.");
      setPipeline(["done","done","idle","idle"]);
      return;
    }
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action:"chat",mode:"plan",
        prompt:user,
        history,
        providers:enabled.map(p=>({id:p.id,key:p.key,model:p.model})),
        selected
      })});
      const data=await r.json();
      if(data.logs?.length)setLogs(l=>[...l,...data.logs]);
      const plan=data.text||fallback;
      const planText="KỊCH BẢN GAME — CHỜ DUYỆT\n\n"+plan+"\n\n---\nSau khi mày đồng ý, Factory mới bắt đầu Build.";
      setMessages(m=>[...m,{role:"assistant",content:planText}]);
      setApproval({prompt:user,plan:planText});
      setNotice("✓ Đã lên kịch bản. Chưa build — chờ mày đồng ý.");
      setPipeline(["done","done","idle","idle"]);
    }catch(e){
      setMessages(m=>[...m,{role:"assistant",content:fallback+"\\n\\nAI Planner tạm unavailable nên đang dùng kịch bản chuẩn Local Planner."}]);
      setApproval({prompt:user,plan:fallback});
      setNotice("✓ AI Planner không khả dụng. Đã dùng Local Planner; chưa build.");
      setPipeline(["done","done","idle","idle"]);
    }
  }

  useEffect(()=>{localStorage.setItem("asf.providers",JSON.stringify(providers));window.__ASF_PROVIDERS__=providers.filter(p=>p.free&&p.enabled&&p.key).map(p=>({id:p.id,key:p.key,model:p.model}));},[providers]);
  useEffect(()=>localStorage.setItem("asf.projects",JSON.stringify(projects)),[projects]);
  useEffect(()=>localStorage.setItem("asf.chats",JSON.stringify(chatSessions)),[chatSessions]);
  useEffect(()=>localStorage.setItem("asf.media",JSON.stringify(mediaHistory)),[mediaHistory]);
  useEffect(()=>{
    if(!activeChat||!messages.length)return;
    const t=setTimeout(()=>setChatSessions(xs=>{
      const chat={id:activeChat,name:project||"Cuộc trò chuyện",projectId:activeProject,messages,logs,updatedAt:new Date().toISOString()};
      const i=xs.findIndex(x=>x.id===chat.id); if(i<0)return[chat,...xs];
      const a=[...xs];a[i]={...a[i],...chat};return a;
    }),400);
    return()=>clearTimeout(t);
  },[messages,logs,activeChat,project,activeProject]);

  useEffect(()=>{
    if(!activeProject)return;
    const t=setTimeout(()=>setProjects(xs=>xs.map(p=>p.id===activeProject?{...p,name:project||"Dự án chưa đặt tên",description:prompt,vercel:preview,previewHtml,previewType,platform,blueprint:messages.filter(x=>x.role==="assistant").map(x=>x.content).join("\n\n"),updatedAt:new Date().toISOString()}:p)),500);
    return()=>clearTimeout(t);
  },[project,prompt,preview,previewHtml,previewType,platform,messages,activeProject]);

  const enabled=useMemo(()=>providers.filter(p=>p.free&&p.enabled&&p.key),[providers]);

  function update(id,patch){setProviders(ps=>ps.map(p=>p.id===id?{...p,...patch}:p))}
  function toggle(id){setProviders(ps=>ps.map(p=>p.id===id?{...p,enabled:!p.enabled}:p))}
  function clearKey(id){update(id,{key:"",enabled:false});setModels(ms=>({...ms,[id]:[]}));setNotice("Đã xoá API key khỏi trình duyệt.");}
  function newProject(){
    const id=Date.now().toString(),chatId="chat-"+Date.now();
    const p={id,name:"Dự án mới",description:"",blueprint:"",github:"",vercel:"",previewHtml:"",updatedAt:new Date().toISOString()};
    setProjects(x=>[p,...x]);setActiveProject(id);setProject(p.name);setPrompt("");setMessages([]);setLogs([]);setPreview("");setPreviewHtml("");setActiveChat(chatId);
    setChatSessions(x=>[{id:chatId,name:"Cuộc trò chuyện mới",projectId:id,messages:[],logs:[],updatedAt:new Date().toISOString()},...x]);
    setNotice("Đã tạo dự án mới.");
  }
  function newChat(){
    const id="chat-"+Date.now();setMessages([]);setLogs([]);setActiveChat(id);
    setChatSessions(x=>[{id,name:"Cuộc trò chuyện mới",projectId:activeProject,messages:[],logs:[],updatedAt:new Date().toISOString()},...x]);
    setNotice("Đã mở cuộc trò chuyện mới.");
  }
  function openProject(p){
    setActiveProject(p.id);setProject(p.name);setPreview(p.vercel||"");setPreviewHtml(p.previewHtml||"");setPreviewType(p.previewType||"universal");setPlatform(p.platform||"web");setPrompt(p.description||"");
    setMessages(p.blueprint?[{role:"assistant",content:p.blueprint}]:[]);setLogs([]);setNotice("Đã mở "+p.name+".");
  }
  function openChat(chat){
    setActiveChat(chat.id);setMessages(chat.messages||[]);setLogs(chat.logs||[]);
    if(chat.projectId){setActiveProject(chat.projectId);const p=projects.find(x=>x.id===chat.projectId);if(p){setProject(p.name);setPreview(p.vercel||"");setPreviewHtml(p.previewHtml||"");setPreviewType(p.previewType||"web-live");setPlatform(p.platform||"web");}}
    setNotice("Đã mở cuộc trò chuyện.");
  }
  function saveProject(){
    const id=activeProject||Date.now().toString();
    const existing=projects.find(x=>x.id===id); const p={...existing,id,name:project||"Dự án chưa đặt tên",description:prompt,blueprint:messages.filter(x=>x.role==="assistant").map(x=>x.content).join("\n\n"),github:existing?.github||"",vercel:preview,previewHtml,previewType,platform,versions:existing?.versions||[],updatedAt:new Date().toISOString()};
    setProjects(xs=>{const i=xs.findIndex(x=>x.id===id);if(i<0)return[p,...xs];const a=[...xs];a[i]={...a[i],...p};return a});setActiveProject(id);setNotice("✓ Đã lưu dự án.");
  }
  function deleteProject(id){
    const p=projects.find(x=>x.id===id);if(!p||!window.confirm("Xóa dự án "+p.name+"?"))return;
    const next=projects.filter(x=>x.id!==id);setProjects(next);
    if(next[0])openProject(next[0]);else{setActiveProject("");setProject("Untitled Project");setPrompt("");setMessages([]);setPreview("");setPreviewHtml("");}
    setNotice("Đã xóa dự án.");
  }
  function deleteChat(id){setChatSessions(x=>x.filter(c=>c.id!==id));if(activeChat===id){setActiveChat("");setMessages([]);setLogs([])}}
  const currentProject=projects.find(p=>p.id===activeProject);
  const versions=currentProject?.versions||[];
  function saveCheckpoint(html,type,plat,source){
    const now=new Date().toISOString();
    const id=activeProject||Date.now().toString();
    setActiveProject(id);
    setProjects(xs=>{
      const found=xs.find(p=>p.id===id);
      const base=found||{id,name:project&&project!=="Untitled Project"?project:"Dự án mới",description:prompt,blueprint:"",github:"",vercel:""};
      const previous=Array.isArray(base.versions)?base.versions:[];
      const version={id:now,number:previous.length+1,html,type,platform:plat,source:source||"ai",createdAt:now};
      const next={...base,previewHtml:html,previewType:type,platform:plat,versions:[...previous.slice(-9),version],updatedAt:now};
      return found?xs.map(p=>p.id===id?next:p):[next,...xs];
    });
    setNotice("✓ Đã lưu checkpoint v"+((versions.length||0)+1)+". Có thể rollback.");
  }
  function rollbackVersion(v){
    if(!v)return;
    setPreviewHtml(v.html);setPreview("");setPreviewType(v.type||"universal");setPlatform(v.platform||"web");
    setProjects(xs=>xs.map(p=>p.id===activeProject?{...p,previewHtml:v.html,previewType:v.type||"universal",platform:v.platform||"web",updatedAt:new Date().toISOString()}:p));
    setNotice("↶ Đã rollback về v"+v.number+".");
  }
  function downloadSource(){
    if(!previewHtml){setNotice("Chưa có sản phẩm để tải.");return}
    const blob=new Blob([previewHtml],{type:"text/html;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(project||"ai-factory-app").toLowerCase().replace(/[^a-z0-9]+/gi,"-")+".html";a.click();URL.revokeObjectURL(a.href);
    setNotice("✓ Đã chuẩn bị file source preview.");
  }

  async function apiBuild(user,history,existingHtml=""){
    const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      action:"build",prompt:user,history,providers:enabled.map(p=>({id:p.id,key:p.key,model:p.model})),selected,existingHtml
    })});
    const data=await r.json();
    if(data.logs?.length)setLogs(l=>[...l,...data.logs]);
    if(!r.ok)throw new Error(data.error||"Không tạo được preview");
    setPreviewHtml(data.html);setPreview("");setPreviewType(data.previewType||"universal");setPlatform(data.platform||"web");setPreviewError("");
    saveCheckpoint(data.html,data.previewType||"universal",data.platform||"web",data.fallback?"local-runtime":data.provider);
    setMessages(m=>[...m,{role:"system",content:"✓ Đã build và đưa sản phẩm vào Live Preview bằng "+(data.provider||"local-runtime")+" · "+(data.platform||"web").toUpperCase()}]);
    setNotice(data.fallback?"⚙ AI FREE đang unavailable — Local Runtime giữ Preview hoạt động.":"✓ Đã triển khai. Preview đã được cập nhật.");
  }

  async function repairPreview(){
    if(!previewHtml||previewRepairing.current)return;
    previewRepairing.current=true;setBusy(true);setNotice("⚙ Đang tự sửa lỗi Live Preview…");
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action:"build",
        prompt:"Sửa lỗi runtime của sản phẩm hiện tại. Giữ nguyên chức năng, giao diện và nền tảng. Lỗi runtime ghi nhận: "+previewError,
        history:[...messages.slice(-10),{role:"user",content:"Runtime error: "+previewError}],
        providers:enabled.map(p=>({id:p.id,key:p.key,model:p.model})),
        selected,
        existingHtml:previewHtml
      })});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||"Không sửa được preview");
      setPreviewHtml(data.html);setPreviewError("");setMessages(m=>[...m,{role:"system",content:"✓ Đã tự sửa lỗi runtime và cập nhật Live Preview."}]);
      setNotice(data.fallback?"⚙ AI FREE unavailable — đã dùng Local Runtime fallback.":"✓ Preview đã được sửa.");
    }catch(e){setNotice("✕ Không tự sửa được: "+e.message)}
    finally{previewRepairing.current=false;setBusy(false)}
  }

  useEffect(()=>{
    function onPreviewMessage(e){
      if(e.data?.source!=="asf-preview-error")return;
      const msg=String(e.data.message||"Lỗi JavaScript trong preview");
      setPreviewError(msg);
      setNotice("⚠ Live Preview phát hiện lỗi: "+msg);
    }
    window.addEventListener("message",onPreviewMessage);
    return()=>window.removeEventListener("message",onPreviewMessage);
  },[]);

  async function run(){
    if(!prompt.trim()||busy)return;
    const user=prompt.trim();
    const history=messages.slice(-12);
    const hasCurrentProduct=Boolean(previewHtml);
    const gameIntent=/\b(game|trò chơi|trò chơi cho bé|game cho bé|game giáo dục|game học tập|mini game)\b/i.test(user);
    const approveIntent=/^(đồng ý|ok|oke|okay|được|chốt|build đi|xây đi|triển khai|làm đi|tiến hành|yes)\b[.!\s]*/i.test(user);
    const vagueEdit=/^(chỉnh sửa được không|sửa được không|có chỉnh sửa được không|edit được không|có sửa được không)[?!.,\s]*$/i.test(user);
    const editIntent=hasCurrentProduct && /\b(chỉnh|sửa|thêm|bớt|xóa|xoá|đổi|thay|bỏ|gỡ|nút|giao diện|tính năng|màu|font|nội dung|layout|màn hình)\b/i.test(user);
    setPrompt("");setMessages(m=>[...m,{role:"user",content:user}]);setBusy(true);
    stickToBottomRef.current=true;
    setLogs(l=>[...l,"Factory: hiểu yêu cầu → kiểm tra kịch bản → chờ duyệt hoặc build"]);
    if(approval&&approveIntent){
      const approvedPrompt=approval.prompt;
      setApproval(null);
      try{
        setPipeline(["done","done","running","running"]);
        await apiBuild(approvedPrompt,[...history,{role:"user",content:user},{role:"assistant",content:approval.plan}],previewHtml);
        setPipeline(["done","done","done","done"]);
        setMessages(m=>[...m,{role:"assistant",content:"✓ Đã được duyệt. Factory đã bắt đầu build theo đúng kịch bản trên và đưa game vào Live Preview."}]);
      }catch(e){
        setMessages(m=>[...m,{role:"assistant",content:"Lỗi build: "+e.message}]);
        setNotice("✕ "+e.message);
        setPipeline(["done","done","error","idle"]);
      }finally{setBusy(false)}
      return;
    }
    if(gameIntent&&!hasCurrentProduct){
      try{
        await requestGamePlan(user,[...history,{role:"user",content:user}]);
      }finally{setBusy(false)}
      return;
    }
    if(approval&&!approveIntent){
      const refinement="Kịch bản đang chờ duyệt. Yêu cầu bổ sung của mày: "+user;
      try{
        await requestGamePlan(approval.prompt,[...history,{role:"user",content:refinement}]);
      }finally{setBusy(false)}
      return;
    }
    if(vagueEdit){
      setMessages(m=>[...m,{role:"assistant",content:"Được. App hiện tại đang nằm trong Live Preview. Mày cứ nói muốn sửa gì, Factory sẽ sửa trực tiếp app này, không tạo app mới."}]);
      setNotice("✓ Giữ nguyên app hiện tại. Nói yêu cầu chỉnh sửa tiếp theo.");
      setBusy(false);
      return;
    }
    if(editIntent){
      try{
        await apiBuild(user,[...history,{role:"user",content:user}],previewHtml);
      }catch(e){
        setMessages(m=>[...m,{role:"assistant",content:"Lỗi: "+e.message}]);
        setNotice("✕ "+e.message);
      }finally{setBusy(false)}
      return;
    }
    try{
      setPipeline(["done","running","idle","idle"]);
      await apiBuild(user,[...history,{role:"user",content:user}],hasCurrentProduct?previewHtml:"");
      setPipeline(["done","done","running","running"]);
      if(enabled.length){
        try{
          const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"chat",mode:"auto",prompt:user,history:[...history,{role:"user",content:user}],providers:enabled.map(p=>({id:p.id,key:p.key,model:p.model})),selected})});
          const data=await r.json();
          if(data.logs?.length)setLogs(l=>[...l,...data.logs]);
          if(r.ok&&data.text)setMessages(m=>[...m,{role:"assistant",content:data.text}]);
          else setLogs(l=>[...l,"AI chat không khả dụng sau build; giữ artifact đã build."]);
        }catch(e){setLogs(l=>[...l,"AI chat fallback: "+e.message])}
      }else{
        setLogs(l=>[...l,"AI chat bỏ qua vì chưa có FREE provider; Local Runtime vẫn build được."]);
      }
      setPipeline(["done","done","done","done"]);
    }catch(e){
      setMessages(m=>[...m,{role:"assistant",content:"Lỗi build: "+e.message}]);setLogs(l=>[...l,"Factory: thất bại — "+e.message]);setNotice("✕ "+e.message);setPipeline(["done","error","idle","idle"]);
    }finally{setBusy(false)}
  }

  async function testProvider(p){
    if(!p.key){setNotice("Nhập API key trước.");return}
    setConnection(x=>({...x,[p.id]:{status:"testing",message:"Đang kiểm tra..."}}));
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"test",provider:p.id,key:p.key,model:p.model})});
      const d=await r.json();setConnection(x=>({...x,[p.id]:d.ok?{status:"connected",message:"Đã kết nối"}:{status:"error",message:d.error||"Kết nối thất bại"}}));setNotice(d.ok?"✓ "+p.name+" kết nối OK":"✕ "+p.name+": "+(d.error||"Không kết nối được"));
    }catch(e){setNotice("✕ Lỗi mạng khi kiểm tra "+p.name)}
  }
  async function loadModels(p){
    if(!p.key){setNotice("Nhập API key trước.");return}setLoadingModels(x=>({...x,[p.id]:true}));
    try{const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"models",provider:p.id,key:p.key})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Không tải được model");setModels(x=>({...x,[p.id]:d.models||[]}));setNotice("✓ Đã tải "+(d.models?.length||0)+" model.");}
    catch(e){setNotice("✕ "+e.message)}finally{setLoadingModels(x=>({...x,[p.id]:false}))}
  }
  async function generateMedia(){
    if(!mediaPrompt.trim()||mediaBusy)return;setMediaBusy(true);
    const item={id:Date.now().toString(),type:mediaType,prompt:mediaPrompt.trim(),status:"queued",createdAt:new Date().toISOString()};
    setMediaHistory(x=>[item,...x]);setNotice("Media API FREE vĩnh viễn hiện chưa đủ điều kiện để gọi tự động; không dùng nguồn trả phí.");setMediaBusy(false);
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo">AI</div><div><b>AI Software Factory</b><span>Build • Preview • Ship</span></div></div>
      <div className="nav">
        <button className={tab==="workspace"?"active":""} onClick={()=>setTab("workspace")}>⌘ Factory</button>
        <button className={tab==="media"?"active":""} onClick={()=>setTab("media")}>✦ Media Studio</button>
        <button className={tab==="settings"?"active":""} onClick={()=>setTab("settings")}>⚙ AI Providers</button>
        <div className="chat-mini"><div className="project-mini-head"><b>Đoạn chat</b><button onClick={newChat}>+</button></div>
          {chatSessions.slice(0,10).map(ch=><div className="project-row" key={ch.id}><button className={activeChat===ch.id?"project-item active":"project-item"} onClick={()=>openChat(ch)}>{ch.name}</button><button className="project-delete" onClick={()=>deleteChat(ch.id)}>×</button></div>)}
          {!chatSessions.length&&<span>Chưa có đoạn chat</span>}
        </div>
        <div className="project-mini"><div className="project-mini-head"><b>Projects</b><button onClick={newProject}>+</button></div>
          {projects.slice(0,8).map(p=><div className="project-row" key={p.id}><button className={activeProject===p.id?"project-item active":"project-item"} onClick={()=>openProject(p)}>{p.name}</button><button className="project-delete" onClick={()=>deleteProject(p.id)}>×</button></div>)}
          {!projects.length&&<span>Chưa có dự án</span>}
        </div>
      </div>
      <div className="side-foot">FREE ONLY · API keys stay in this browser.</div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="status"><span className="dot"/>{enabled.length} provider sẵn sàng</div><div className="row"><button className="btn" onClick={newChat}>+ Chat mới</button><button className="btn" onClick={()=>setTab("settings")}>Manage AI</button></div></header>
      <div className="content">
        {tab==="workspace"&&<section className="workspace">
          <div className="hero"><div><div className="eyebrow">AI SOFTWARE FACTORY</div><h1>Một ô nói chuyện. Một ô thấy sản phẩm.</h1><p>Không cần AI Code Studio riêng. Mô tả → AI hiểu → tự build → tự đưa sản phẩm vào Preview.</p></div><div className="row"><button className="btn" onClick={newProject}>+ New project</button><button className="btn primary" onClick={saveProject}>Save</button></div></div>
          {notice&&<div className="card factory-notice">{notice}</div>}
          <div className="factory-grid">
            <div className="card chat factory-chat">
              <div className="factory-head"><div><h2>AI Factory</h2><div className="muted">Conversation + build agent hợp nhất</div></div><input value={project} onChange={e=>setProject(e.target.value)} /></div>
              <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>{messages.length?messages.map((m,i)=><div key={i} className={"msg "+(m.role==="user"?"user":m.role==="system"?"system":"ai")}><b>{m.role==="user"?"Bạn":m.role==="system"?"Factory":"AI"} </b><div>{m.content}</div></div>):<div className="empty"><strong>Hãy nói app mày muốn làm.</strong><br/>Ví dụ: “Tạo app Android mở lên có nút bấm, bấm vào thì đọc số từ 1 đến 100 bằng tiếng Việt.”<br/><br/>Factory sẽ giữ platform, tự chọn công nghệ phù hợp và đưa kết quả sang Preview.</div>}</div>
              <div className="composer">
                <div className="field"><label>AI Router</label><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="auto">Auto fallback — FREE</option>{enabled.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></div>
                <div className="field"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")run()}} placeholder="Nói thẳng thứ mày muốn xây… ví dụ: tạo app Android đọc 1–100 bằng tiếng Việt."/></div>
                <div className="factory-send"><span className="muted">{busy?"Factory đang xây và kiểm tra preview…":"Ctrl/Cmd + Enter để triển khai"}</span><button className="btn primary" disabled={busy} onClick={run}>{busy?"Đang build…":"Gửi & triển khai →"}</button></div>
              </div>
            </div>

            <div className="card preview-card">
              <div className="preview-head"><div><h2>Live Preview</h2><div className="muted">{previewType==="device-simulator"?"Device Simulator":previewType==="web-live"?"Web Runtime":"Universal Runtime"} · {platform.toUpperCase()}</div></div><div className="row">{previewHtml&&<><span className="pill ok">● RUNNING</span><button className="btn" onClick={downloadSource}>↓ Source</button></>}</div></div>
              {previewHtml?<div className={"live-frame "+(previewType==="device-simulator"?"device-preview":"")}><div className="live-frame-head"><b>{previewType==="device-simulator"?"DEVICE SIMULATOR":platform==="web"?"WEB APP":"LIVE APP"}</b><span>Interactive · Universal Preview</span></div><iframe title="AI Factory Live Preview" srcDoc={instrumentPreview(previewHtml)} sandbox="allow-scripts allow-forms allow-modals"/>{previewError&&<div className="preview-error"><span>⚠ {previewError}</span><button className="btn" disabled={busy} onClick={repairPreview}>{busy?"Đang sửa…":"Tự sửa lỗi"}</button></div>}</div>:preview?<div className="live-frame"><div className="live-frame-head"><b>DEPLOYED</b><a href={preview} target="_blank" rel="noreferrer">Mở ↗</a></div><iframe title="Deployed Preview" src={preview}/></div>:<div className="preview-empty"><div><div className="preview-icon">◫</div><strong>Preview sẽ xuất hiện ở đây</strong><p>Chỉ cần nói app mày muốn làm. Factory sẽ tự build và render sản phẩm tại đây.</p></div></div>}
              <div className="review"><div className="metric"><b>{enabled.length}</b><span>FREE AI</span></div><div className="metric"><b>{messages.filter(x=>x.role==="user").length}</b><span>Yêu cầu</span></div><div className="metric"><b>{logs.length}</b><span>Pipeline</span></div></div>
              <div className="pipeline"><div className="pipeline-title">FACTORY PIPELINE</div>{["Understand","Plan","Build","Preview"].map((x,i)=><div className={"pipeline-step "+(pipeline[i]==="running"?"running":pipeline[i]==="done"?"done":pipeline[i]==="error"?"error":"")} key={x}><span>{pipeline[i]==="done"?"✓":i+1}</span>{x}</div>)}</div>{versions.length>0&&<div className="version-strip"><div className="row" style={{justifyContent:"space-between"}}><b>CHECKPOINTS</b><span className="muted">{versions.length} phiên bản</span></div><div className="version-list">{versions.slice().reverse().map(v=><button className="version-btn" key={v.id} onClick={()=>rollbackVersion(v)}>v{v.number} · {v.source} · {new Date(v.createdAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</button>)}</div></div>}
            </div>
          </div>
          <div className="card logs-card"><div className="row" style={{justifyContent:"space-between"}}><h2>Factory logs</h2><span className="muted">Không dùng AI trả phí</span></div><div className="logs">{logs.length?logs.slice(-16).map((x,i)=><div className="log" key={i}>{x}</div>):<div className="log">Factory idle.</div>}</div></div>
        </section>}

        {tab==="media"&&<section className="settings">
          <div className="hero"><div><div className="eyebrow">CREATIVE</div><h1>AI Media Studio</h1><p>Workflow media nằm trong cùng Factory. Chỉ gọi nguồn API khi đáp ứng đúng điều kiện FREE.</p></div></div>
          {notice&&<div className="card factory-notice">{notice}</div>}
          <div className="grid"><div className="card"><div className="row"><button className={"btn "+(mediaType==="image"?"primary":"")} onClick={()=>setMediaType("image")}>▧ Image</button><button className={"btn "+(mediaType==="video"?"primary":"")} onClick={()=>setMediaType("video")}>▶ Video</button></div><div className="field"><label>Mô tả</label><textarea value={mediaPrompt} onChange={e=>setMediaPrompt(e.target.value)} placeholder="Mô tả hình ảnh / video cần tạo…"/></div><div className="field"><label>Ảnh tham chiếu</label><input type="file" accept="image/*,video/*"/></div><button className="btn primary" disabled={mediaBusy} onClick={generateMedia}>Generate</button></div><div className="card"><h2>Media history</h2><div className="logs">{mediaHistory.length?mediaHistory.slice(0,12).map(x=><div className="log" key={x.id}><b>{x.type.toUpperCase()}</b> · {x.prompt}<br/><span className="muted">{new Date(x.createdAt).toLocaleString("vi-VN")} · {x.status}</span></div>):<div className="log">Chưa có media.</div>}</div></div></div>
        </section>}

        {tab==="settings"&&<section className="settings">
          <div className="hero"><div><div className="eyebrow">FREE AI POOL</div><h1>AI Providers</h1><p>Chỉ Gemini, Groq và OpenRouter FREE. Không fallback sang API trả phí.</p></div></div>
          {notice&&<div className="card factory-notice">{notice}</div>}
          <div className="card"><h2>Provider pool</h2><div className="muted">Router chỉ gọi provider có key và được bật.</div><div className="providers">{providers.map(p=><div className="provider" key={p.id}>
            <div className="provider-head"><div><div className="provider-name">{p.name} <span className="pill ok">FREE</span></div><span className="pill">{p.id}</span></div><button className={"switch "+(p.enabled?"on":"")} onClick={()=>toggle(p.id)}/></div>
            <div className="field"><label>Model</label><select value={p.model||""} onChange={e=>update(p.id,{model:e.target.value})}>{models[p.id]?.length?models[p.id].map(m=><option key={m.id} value={m.id}>{m.name}</option>):<option value={p.model}>{p.model}</option>}</select></div>
            <div className="field"><label>API key</label><input type="password" value={p.key||""} onChange={e=>update(p.id,{key:e.target.value})} placeholder={p.placeholder}/></div>
            <div className="provider-actions"><button className="btn" onClick={()=>loadModels(p)} disabled={loadingModels[p.id]}>{loadingModels[p.id]?"Đang tải…":"↻ Models"}</button><button className="btn" onClick={()=>testProvider(p)}>Test</button><button className="btn" onClick={()=>clearKey(p.id)}>Clear</button><a className="btn primary" href={p.keyUrl} target="_blank" rel="noopener noreferrer">Lấy key ↗</a>{connection[p.id]&&<span className={"connection "+connection[p.id].status}>{connection[p.id].status==="connected"?"● OK":connection[p.id].status==="testing"?"○ ...":"× "+connection[p.id].message}</span>}</div>
          </div>)}</div></div>
        </section>}
      </div>
    </main>
  </div>
}
