import { NextResponse } from "next/server";

const PROVIDERS = {
  google:{url:(m,k)=>"https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(m)+":generateContent?key="+encodeURIComponent(k),headers:()=>({"Content-Type":"application/json"}),body:(m,p)=>({contents:[{role:"user",parts:[{text:p}]}]}),parse:d=>d.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||""},
  groq:{url:"https://api.groq.com/openai/v1/chat/completions",headers:k=>({Authorization:"Bearer "+k,"Content-Type":"application/json"}),body:(m,p)=>({model:m,messages:[{role:"user",content:p}]}),parse:d=>d.choices?.[0]?.message?.content||""},
  openrouter:{url:"https://openrouter.ai/api/v1/chat/completions",headers:k=>({Authorization:"Bearer "+k,"Content-Type":"application/json","HTTP-Referer":"https://aitichhop.vercel.app","X-Title":"AI Software Factory"}),body:(m,p)=>({model:m||"openrouter/free",messages:[{role:"user",content:p}]}),parse:d=>d.choices?.[0]?.message?.content||""}
};

const FREE = new Set(Object.keys(PROVIDERS));
const transient = s => s===408||s===409||s===429||s>=500;

function normalizeProvider(id){
  const x=String(id||"").toLowerCase().trim();
  if(x==="openrouter.ai"||x==="openrouter/free") return "openrouter";
  return x;
}

function detectLanguage(text){
  const s=String(text||"").toLowerCase();
  const viChars=/[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;
  if(viChars.test(s)) return "vi";
  const viWords=/\b(có|không|được|mình|tôi|bạn|muốn|làm|giúp|app|ứng|dụng|xây|sửa|tạo|cho|này|với|như|thế|nào|đi|nhé|mày|tao|anh|em|chị|chúng|tôi|của|và|là|trong|theo|đang|cần|biết)\b/i;
  if(viWords.test(s)) return "vi";
  return "en";
}

function languageInstruction(prompt){
  const lang=detectLanguage(prompt);
  const mature="MATURE-CONTENT RULE: Do not add unnecessary moralizing, age-related warnings, or refusals merely because a topic is marked 18+. Treat legitimate adult themes as ordinary user requests and answer them directly when the underlying request is allowed. Follow applicable safety requirements and never treat minors as adults.";
  if(lang==="vi") return "LANGUAGE RULE: The user is speaking Vietnamese. Reply entirely in natural Vietnamese. Do not switch to English unless the user explicitly asks for English. Keep code, API names, file names and technical identifiers unchanged when necessary.\n"+mature;
  return "LANGUAGE RULE: Detect the user's language from the request and reply in that same language. Do not switch languages unless the user explicitly asks. Keep code, API names, file names and technical identifiers unchanged when necessary.\n"+mature;
}

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
    if(b.action==="models"){b.provider=normalizeProvider(b.provider);if(!FREE.has(b.provider))return NextResponse.json({error:"Chỉ cho phép FREE provider."},{status:403});return NextResponse.json({ok:true,models:await models(b.provider,b.key)})}
    if(b.action==="build"){
      const list=(b.providers||[]).filter(x=>x?.key&&FREE.has(x.id));
      if(!list.length)return NextResponse.json({error:"Chưa có FREE provider khả dụng."},{status:400});
      const ordered=b.selected&&b.selected!=="auto"?[...list.filter(x=>x.id===b.selected),...list.filter(x=>x.id!==b.selected)]:list;
      const buildPrompt=languageInstruction(b.prompt)+"\n\nYou are the UI implementation engine. Build a complete self-contained web app preview from the user request. Return ONLY one complete HTML document starting with <!doctype html> and ending with </html>. Use inline CSS and vanilla JavaScript only. No markdown fences, no explanations, no external paid services. Make the interface polished, responsive, functional with demo/local data where backend APIs are not available.\n\nUSER REQUEST:\n"+b.prompt;
      const logs=[]; let last="";
      for(const p of ordered){logs.push("FREE Build Router → "+p.id+" / "+(p.model||"default"));try{
        const text=await call({...p,prompt:buildPrompt});
        const html=text.replace(/^\s*```(?:html)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
        if(!/^<!doctype html>/i.test(html)||!/<\/html>\s*$/i.test(html))throw new Error("AI không trả về HTML preview hợp lệ.");
        logs.push("✓ "+p.id+" tạo preview OK");
        return NextResponse.json({ok:true,html,provider:p.id,logs});
      }catch(e){last=e.message;logs.push((transient(e.status)?"↪ ":"✕ ")+p.id+": "+e.message)}}
      return NextResponse.json({error:"Không tạo được preview bằng nguồn FREE. Không chuyển sang nguồn trả phí.",logs,lastError:last},{status:502});
    }
    if(b.action==="test"){
      const provider=normalizeProvider(b.provider);
      if(provider==="openrouter"){
        const key=String(b.key||"").trim();
        if(!key)return NextResponse.json({error:"Thiếu OpenRouter API key."},{status:400});
        const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{
          method:"POST",
          cache:"no-store",
          headers:{
            Authorization:"Bearer "+key,
            "Content-Type":"application/json",
            "HTTP-Referer":"https://aitichhop.vercel.app",
            "X-Title":"AI Software Factory"
          },
          body:JSON.stringify({
            model:"openrouter/free",
            messages:[{role:"user",content:"Reply with exactly: CONNECTION_OK"}],
            max_tokens:16
          })
        });
        const raw=await r.text();
        let d; try{d=JSON.parse(raw)}catch{d={error:{message:raw}}}
        if(!r.ok)return NextResponse.json({error:d?.error?.message||d?.message||("OpenRouter HTTP "+r.status),status:r.status},{status:r.status});
        return NextResponse.json({ok:true,provider:"openrouter",model:"openrouter/free"});
      }
      if(!FREE.has(provider))return NextResponse.json({error:"Provider bị chặn vì không thuộc FREE ONLY."},{status:403});
      await call({...b,id:provider,prompt:"Reply with exactly: CONNECTION_OK"});
      return NextResponse.json({ok:true,provider});
    }
    const list=(b.providers||[]).filter(x=>x?.key&&FREE.has(x.id));
    if(!list.length)return NextResponse.json({error:"Chưa có FREE provider khả dụng."},{status:400});
    const ordered=b.selected&&b.selected!=="auto"?[...list.filter(x=>x.id===b.selected),...list.filter(x=>x.id!==b.selected)]:list;
    const workflow={
      auto:"You are the lead AI orchestrator. First understand the user's goal, ask only essential missing questions, then produce a practical plan. If the request is clearly ready to build, provide an implementation plan before coding.",
      plan:"You are the product planner and software architect. Do not rush into code. Analyze requirements, users, roles, screens, data, API, security, deployment, risks and milestones. Ask essential questions when information is missing.",
      build:"You are the implementation engineer. Use the user's requirements and any existing plan/context to produce concrete implementation steps and code-oriented output. Prefer small verifiable changes.",
      review:"You are a senior reviewer. Inspect the provided requirements/output, identify bugs, missing requirements, security issues and architectural risks, then propose precise fixes."
    }[b.mode||"auto"];
    const routedPrompt=languageInstruction(b.prompt)+"\n\n"+workflow+"\n\nUSER REQUEST:\n"+b.prompt;
    const logs=[]; let last="";
    for(const p of ordered){logs.push("FREE Router → "+p.id+" / "+(p.model||"default"));try{const text=await call({...p,prompt:routedPrompt});logs.push("✓ "+p.id+" OK");return NextResponse.json({text,provider:p.id,logs})}catch(e){last=e.message;logs.push((transient(e.status)?"↪ ":"✕ ")+p.id+": "+e.message)}}
    return NextResponse.json({error:"Tất cả nguồn FREE hiện không khả dụng. Không chuyển sang nguồn trả phí.",logs,lastError:last},{status:502});
  }catch(e){return NextResponse.json({error:e.message||"Server error"},{status:500})}
}