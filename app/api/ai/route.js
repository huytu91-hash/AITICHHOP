import { NextResponse } from "next/server";

const PROVIDERS = {
  google:{url:(m,k)=>"https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(m)+":generateContent?key="+encodeURIComponent(k),headers:()=>({"Content-Type":"application/json"}),body:(m,p)=>({contents:[{role:"user",parts:[{text:p}]}]}),parse:d=>d.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||""},
  groq:{url:"https://api.groq.com/openai/v1/chat/completions",headers:k=>({Authorization:"Bearer "+k,"Content-Type":"application/json"}),body:(m,p)=>({model:m,messages:[{role:"user",content:p}]}),parse:d=>d.choices?.[0]?.message?.content||""},
  openrouter:{url:"https://openrouter.ai/api/v1/chat/completions",headers:k=>({Authorization:"Bearer "+k,"Content-Type":"application/json","HTTP-Referer":"https://aitichhop.vercel.app","X-Title":"AI Software Factory"}),body:(m,p)=>({model:m||"openrouter/free",messages:[{role:"user",content:p}]}),parse:d=>d.choices?.[0]?.message?.content||""}
};

const FREE = new Set(Object.keys(PROVIDERS));
const transient = s => s===408||s===409||s===429||s>=500;

async function models(provider,key){
  let url="",headers={};
  if(provider==="google") url="https://generativelanguage.googleapis.com/v1beta/models?key="+encodeURIComponent(key)+"&pageSize=1000";
  if(provider==="groq"){url="https://api.groq.com/openai/v1/models";headers={Authorization:"Bearer "+key};}
  if(provider==="openrouter"){url="https://openrouter.ai/api/v1/models";headers={Authorization:"Bearer "+key};}
  if(!url) throw new Error("Provider FREE không hỗ trợ.");
  const r=await fetch(url,{headers}), raw=await r.text(); let d; try{d=JSON.parse(raw)}catch{d={error:{message:raw}}}
  if(!r.ok) throw new Error(d?.error?.message||d?.message||("HTTP "+r.status));
  let a=[];
  if(provider==="google") a=(d.models||[]).filter(x=>(x.supportedGenerationMethods||[]).includes("generateContent")).map(x=>({id:(x.baseModelId||x.name||"").replace(/^models\//,""),name:x.displayName||x.baseModelId||x.name}));
  else a=(d.data||[]).map(x=>({id:x.id,name:x.name||x.id}));
  if(provider==="openrouter") a=a.filter(x=>x.id==="openrouter/free"||x.id.endsWith(":free"));
  return a.filter(x=>x.id).sort((x,y)=>x.name.localeCompare(y.name));
}

async function call(p){
  if(!FREE.has(p.id)) throw new Error("BLOCKED: paid provider");
  if(p.id==="openrouter" && p.model!=="openrouter/free" && !String(p.model||"").endsWith(":free")) throw new Error("BLOCKED: paid OpenRouter model");
  const c=PROVIDERS[p.id], r=await fetch(typeof c.url==="function"?c.url(p.model,p.key):c.url,{method:"POST",headers:c.headers(p.key),body:JSON.stringify(c.body(p.model,p.prompt))});
  const raw=await r.text(); let d; try{d=JSON.parse(raw)}catch{d={error:{message:raw}}}
  if(!r.ok){const e=new Error(d?.error?.message||d?.message||("HTTP "+r.status));e.status=r.status;throw e}
  const text=c.parse(d); if(!text) throw new Error("Provider trả về rỗng."); return text;
}

export async function POST(req){
  try{
    const b=await req.json();
    if(b.action==="models"){if(!FREE.has(b.provider))return NextResponse.json({error:"Chỉ cho phép FREE provider."},{status:403});return NextResponse.json({ok:true,models:await models(b.provider,b.key)})}
    if(b.action==="test"){if(!FREE.has(b.provider))return NextResponse.json({error:"Provider bị chặn vì không thuộc FREE ONLY."},{status:403});await call({...b,prompt:"Reply with exactly: CONNECTION_OK"});return NextResponse.json({ok:true})}
    const list=(b.providers||[]).filter(x=>x?.key&&FREE.has(x.id));
    if(!list.length)return NextResponse.json({error:"Chưa có FREE provider khả dụng."},{status:400});
    const ordered=b.selected&&b.selected!=="auto"?[...list.filter(x=>x.id===b.selected),...list.filter(x=>x.id!==b.selected)]:list;
    const workflow={
      auto:"You are the lead AI orchestrator. First understand the user's goal, ask only essential missing questions, then produce a practical plan. If the request is clearly ready to build, provide an implementation plan before coding.",
      plan:"You are the product planner and software architect. Do not rush into code. Analyze requirements, users, roles, screens, data, API, security, deployment, risks and milestones. Ask essential questions when information is missing.",
      build:"You are the implementation engineer. Use the user's requirements and any existing plan/context to produce concrete implementation steps and code-oriented output. Prefer small verifiable changes.",
      review:"You are a senior reviewer. Inspect the provided requirements/output, identify bugs, missing requirements, security issues and architectural risks, then propose precise fixes."
    }[b.mode||"auto"];
    const routedPrompt=workflow+"\n\nUSER REQUEST:\n"+b.prompt;
    const logs=[]; let last="";
    for(const p of ordered){logs.push("FREE Router → "+p.id+" / "+(p.model||"default"));try{const text=await call({...p,prompt:routedPrompt});logs.push("✓ "+p.id+" OK");return NextResponse.json({text,provider:p.id,logs})}catch(e){last=e.message;logs.push((transient(e.status)?"↪ ":"✕ ")+p.id+": "+e.message)}}
    return NextResponse.json({error:"Tất cả nguồn FREE hiện không khả dụng. Không chuyển sang nguồn trả phí.",logs,lastError:last},{status:502});
  }catch(e){return NextResponse.json({error:e.message||"Server error"},{status:500})}
}