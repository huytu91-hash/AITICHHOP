import { NextResponse } from "next/server";

const PROVIDERS = {
  openai: {
    url: "https://api.openai.com/v1/responses",
    headers: key => ({Authorization:"Bearer "+key,"Content-Type":"application/json"}),
    body: (model,input) => ({model,input}),
    parse: d => d.output_text || d.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join("") || ""
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: key => ({"x-api-key":key,"anthropic-version":"2023-06-01","Content-Type":"application/json"}),
    body: (model,input) => ({model,max_tokens:2048,messages:[{role:"user",content:input}]}),
    parse: d => (d.content||[]).map(x=>x.text||"").join("")
  },
  google: {
    url: (model,key) => "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),
    headers: () => ({"Content-Type":"application/json"}),
    body: (model,input) => ({contents:[{role:"user",parts:[{text:input}]}]}),
    parse: d => d.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("") || ""
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: key => ({Authorization:"Bearer "+key,"Content-Type":"application/json","HTTP-Referer":"https://xoa-du-an.vercel.app","X-Title":"AI Software Factory"}),
    body: (model,input) => ({model,messages:[{role:"user",content:input}]}),
    parse: d => d.choices?.[0]?.message?.content || ""
  }
};

async function callProvider(p){
  const cfg=PROVIDERS[p.id];
  if(!cfg) throw new Error("Provider "+p.id+" chưa được hỗ trợ.");
  const url=typeof cfg.url==="function"?cfg.url(p.model,p.key):cfg.url;
  const res=await fetch(url,{method:"POST",headers:cfg.headers(p.key),body:JSON.stringify(cfg.body(p.model,p.prompt))});
  const raw=await res.text();
  let data; try{data=JSON.parse(raw)}catch{data={error:{message:raw}}}
  if(!res.ok){
    const msg=data?.error?.message||data?.message||("HTTP "+res.status);
    const err=new Error(msg); err.status=res.status; throw err;
  }
  const text=cfg.parse(data);
  if(!text) throw new Error("Provider trả về rỗng.");
  return text;
}

export async function POST(req){
  try{
    const body=await req.json();
    if(body.action==="test"){
      await callProvider({...body,prompt:"Reply with exactly: CONNECTION_OK"});
      return NextResponse.json({ok:true});
    }
    const list=(body.providers||[]).filter(x=>x?.key&&x?.id);
    if(!list.length)return NextResponse.json({error:"No provider configured."},{status:400});
    const ordered=body.selected&&body.selected!=="auto"
      ? [...list.filter(x=>x.id===body.selected),...list.filter(x=>x.id!==body.selected)]
      : list;
    const logs=[]; let lastError=null;
    for(const p of ordered){
      logs.push("Router → "+p.id+" / "+(p.model||"default"));
      try{
        const text=await callProvider({...p,prompt:body.prompt});
        logs.push("✓ "+p.id+" responded successfully.");
        return NextResponse.json({text,provider:p.id,logs});
      }catch(e){
        lastError=e;
        logs.push("✕ "+p.id+" failed: "+e.message);
      }
    }
    return NextResponse.json({error:"Tất cả provider đều thất bại. "+(lastError?.message||""),logs},{status:502});
  }catch(e){
    return NextResponse.json({error:e.message||"Server error"},{status:500});
  }
}
