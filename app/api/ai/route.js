import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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

function compactHistory(history){
  return (Array.isArray(history)?history:[])
    .filter(x=>x&&x.content)
    .slice(-12)
    .map(x=>(x.role==="user"?"USER":"AI")+": "+String(x.content).trim())
    .join("\n");
}

function inferContext(history,current){
  const all=((Array.isArray(history)?history:[]).map(x=>x?.content||[]).concat([current])).join("\n").toLowerCase();
  const context=[];
  if(/\bandroi(?:d)?\b|android\s*(phone|điện thoại|app)?/.test(all)) context.push("Nền tảng: Android.");
  if(/\b(ios|iphone|ipad)\b/.test(all)) context.push("Nền tảng: iOS.");
  if(/\b(web|website|trang web)\b/.test(all)) context.push("Nền tảng: Web.");
  if(/tiếng\s*việt|\bviệt\b/.test(all)||detectLanguage(all)==="vi") context.push("Ngôn ngữ người dùng: tiếng Việt.");
  if(/đọc.{0,30}(1|một).{0,20}100|1\s*(đến|-|tới)\s*100|text.?to.?speech|tts/.test(all)) context.push("Chức năng: đọc số từ 1 đến 100 bằng giọng nói.");
  if(/mở ra|bấm|nhấn|click|nút/.test(all)) context.push("Tương tác: mở app rồi bấm nút để bắt đầu.");
  const buildIntent=/tạo|làm|xây|build|create|app|ứng dụng/.test(all);
  if(buildIntent) context.push("Ý định: xây dựng một ứng dụng thực tế.");
  return context;
}

function conversationInstruction(history,current){
  const transcript=compactHistory(history);
  const facts=inferContext(history,current);
  return `CONVERSATION CONTEXT RULE:
- Treat the conversation transcript below as one continuous conversation, not separate requests.
- Preserve facts from earlier turns and resolve short replies, typos and shorthand using that context. For example, "androi" means Android when the prior request is about an app.
- Merge new information into the existing requirements. Do not restart discovery on every turn.
- Do not ask for technical choices (framework, language, architecture, APIs, etc.) when the user has said "cái nào dễ thì làm", "tự chọn", or equivalent. Choose a practical implementation yourself.
- Ask a clarification only when a missing fact would materially change the product and cannot reasonably be inferred.
- If the requirements are already sufficient to implement, say so and move directly toward a concrete build/implementation plan instead of asking more questions.
- Known facts inferred from this conversation: ${facts.length?facts.join(" "):"No structured facts inferred yet."}
- Recent transcript:
${transcript||"(first turn)"}
- Current user message:
${current}`;
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
  const text=c.parse(d); if(!text) throw new Error("Provider trả về rỗng.");
  const quota={
    remainingRequests:r.headers.get("x-ratelimit-remaining-requests")||r.headers.get("x-ratelimit-remaining")||r.headers.get("ratelimit-remaining")||null,
    limitRequests:r.headers.get("x-ratelimit-limit-requests")||r.headers.get("x-ratelimit-limit")||r.headers.get("ratelimit-limit")||null,
    remainingTokens:r.headers.get("x-ratelimit-remaining-tokens")||null,
    limitTokens:r.headers.get("x-ratelimit-limit-tokens")||null
  };
  return {text,quota};
}


function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function localPreview(prompt,platform,existing){
  const safe=escapeHtml(prompt||"AI Software Factory");
  const title=/game|trò chơi|mini game|bé|học/i.test(prompt||"")?"Mini Game Studio":"AI Product Studio";
  const mobile=platform==="android"||platform==="ios";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#080b12;color:#f5f7fb;font:14px Inter,system-ui,-apple-system,sans-serif}
  button{font:inherit;border:0;cursor:pointer}.shell{min-height:100vh;background:radial-gradient(circle at 80% 0%,#23355f 0,#0d1424 34%,#080b12 70%);padding:28px}
  .app{max-width:1180px;margin:auto;border:1px solid #26324a;background:rgba(13,18,30,.88);backdrop-filter:blur(18px);border-radius:28px;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.5)}
  .top{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #202a3e}.brand{display:flex;gap:12px;align-items:center}.logo{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#7c5cff,#35d6c7);font-weight:900}.muted{color:#8f9bb2}
  .body{display:grid;grid-template-columns:230px 1fr;min-height:650px}.nav{padding:18px;border-right:1px solid #202a3e}.nav button{width:100%;text-align:left;background:transparent;color:#9ba7bc;padding:12px 13px;border-radius:12px;margin-bottom:5px}.nav button.active,.nav button:hover{background:#182239;color:#fff}
  .main{padding:30px}.hero{display:flex;justify-content:space-between;gap:25px;align-items:end;margin-bottom:24px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:#6ee7d8;font-weight:800}.hero h1{font-size:38px;line-height:1.05;margin:8px 0}.hero p{max-width:640px;color:#9ba7bc}
  .cta{background:linear-gradient(135deg,#7c5cff,#35c9bf);color:white;padding:12px 18px;border-radius:12px;font-weight:800;box-shadow:0 10px 28px rgba(77,83,220,.3)}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{padding:18px;border:1px solid #253149;background:#111827;border-radius:18px}.stat{font-size:28px;font-weight:900;margin-top:8px}.label{font-size:12px;color:#8f9bb2}
  .wide{grid-column:span 2}.list{display:grid;gap:9px}.row{display:flex;align-items:center;justify-content:space-between;padding:13px;border:1px solid #202b40;border-radius:13px;background:#0d1422}.pill{font-size:11px;padding:5px 8px;border-radius:999px;background:#193c39;color:#6ee7d8}
  .game{min-height:300px;border-radius:22px;border:1px solid #293754;background:radial-gradient(circle at 50% 15%,#354d84,#111827 60%);padding:25px;position:relative;overflow:hidden}.orb{width:120px;height:120px;border-radius:50%;margin:25px auto;background:radial-gradient(circle at 35% 30%,#fff,#75d8ff 18%,#5c5cff 60%,#24205b);box-shadow:0 0 55px #5967ff;animation:float 2.8s ease-in-out infinite}.score{position:absolute;top:18px;right:18px;background:#0b1020cc;padding:9px 12px;border-radius:12px}.center{text-align:center}.center h2{font-size:28px;margin:5px}.actions{display:flex;justify-content:center;gap:10px;margin-top:18px}.secondary{background:#1a2437;color:#dce5f5;padding:11px 15px;border-radius:11px}@keyframes float{50%{transform:translateY(-10px) scale(1.04)}}
  @media(max-width:760px){.shell{padding:8px}.app{border-radius:18px}.body{grid-template-columns:1fr}.nav{display:flex;overflow:auto;border-right:0;border-bottom:1px solid #202a3e;gap:6px}.nav button{min-width:110px;margin:0}.main{padding:18px}.hero{display:block}.hero .cta{margin-top:14px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.hero h1{font-size:30px}}
  </style></head><body><div class="shell"><div class="app"><header class="top"><div class="brand"><div class="logo">AI</div><div><b>${title}</b><div class="muted">Premium local preview</div></div></div><span class="pill">LIVE</span></header>
  <div class="body"><nav class="nav"><button class="active">Overview</button><button>Workspace</button><button>Activity</button><button>Settings</button></nav><main class="main">
  <section class="hero"><div><div class="eyebrow">AI Software Factory</div><h1>${title}</h1><p>Preview đang chạy bằng Local Runtime. Yêu cầu của bạn: <b>${safe}</b></p></div><button class="cta" id="start">Bắt đầu trải nghiệm</button></section>
  <div class="grid"><div class="card"><div class="label">PROJECT HEALTH</div><div class="stat">92%</div><div class="muted">Build quality</div></div><div class="card"><div class="label">PROGRESS</div><div class="stat">7 / 10</div><div class="muted">Milestones</div></div><div class="card"><div class="label">STATUS</div><div class="stat">Live</div><div class="muted">Ready to interact</div></div>
  <div class="card wide"><div class="label">LIVE EXPERIENCE</div><div class="game"><div class="score">★ <span id="score">0</span></div><div class="orb"></div><div class="center"><h2>Sẵn sàng?</h2><div class="muted">Đây là runtime dự phòng để preview không bị trắng.</div><div class="actions"><button class="cta" id="play">Chơi / Mở app</button><button class="secondary" id="reset">Đặt lại</button></div></div></div></div>
  <div class="card"><div class="label">RECENT ACTIVITY</div><div class="list"><div class="row"><span>Preview initialized</span><span class="pill">OK</span></div><div class="row"><span>Interaction ready</span><span class="pill">LIVE</span></div><div class="row"><span>Local fallback</span><span class="pill">FREE</span></div></div></div></div>
  </main></div></div></div><script>
  addEventListener("DOMContentLoaded",()=>{let n=0;const s=document.getElementById("score"),play=document.getElementById("play"),reset=document.getElementById("reset"),start=document.getElementById("start");const go=()=>{n++;if(s)s.textContent=n};[play,start].forEach(x=>x&&x.addEventListener("click",go));reset&&reset.addEventListener("click",()=>{n=0;if(s)s.textContent="0"});});
  </script></body></html>`;
}export async function POST(req){
  try{
    const b=await req.json();
    if(b.action==="media"){
      if(b.type!=="image") return NextResponse.json({error:"Video chưa được hỗ trợ. Media Studio hiện chỉ tạo ảnh."},{status:400});
      const prompt=String(b.prompt||"").trim();
      if(!prompt) return NextResponse.json({error:"Hãy nhập mô tả ảnh cần tạo."},{status:400});
      if(prompt.length>2000) return NextResponse.json({error:"Mô tả ảnh không được vượt quá 2.000 ký tự."},{status:400});
      if(!process.env.NETLIFY_AI_GATEWAY_KEY||!process.env.NETLIFY_AI_GATEWAY_BASE_URL) return NextResponse.json({error:"Netlify AI Gateway chưa sẵn sàng. Hãy deploy production trước rồi thử lại."},{status:503});
      const ai=new GoogleGenAI({
        apiKey:process.env.NETLIFY_AI_GATEWAY_KEY,
        httpOptions:{baseUrl:process.env.NETLIFY_AI_GATEWAY_BASE_URL.replace(/\/$/,"")}
      });
      const response=await ai.models.generateContent({model:"gemini-2.5-flash-image",contents:prompt});
      const parts=response.candidates?.[0]?.content?.parts||[];
      const image=parts.find(part=>part.inlineData?.data);
      if(!image) return NextResponse.json({error:"Model chưa trả về ảnh. Hãy thử mô tả khác."},{status:502});
      return NextResponse.json({ok:true,image:`data:${image.inlineData.mimeType||"image/png"};base64,${image.inlineData.data}`,model:"gemini-2.5-flash-image"});
    }
    if(b.action==="models"){b.provider=normalizeProvider(b.provider);if(!FREE.has(b.provider))return NextResponse.json({error:"Chỉ cho phép FREE provider."},{status:403});return NextResponse.json({ok:true,models:await models(b.provider,b.key)})}
    if(b.action==="build"){
      const list=(b.providers||[]).filter(x=>x?.key&&FREE.has(x.id));
      const ordered=b.selected&&b.selected!=="auto"?[...list.filter(x=>x.id===b.selected),...list.filter(x=>x.id!==b.selected)]:list;
      const contextText=conversationInstruction(b.history,b.prompt);
      const allContext=(String(b.prompt||"")+"\\n"+String(b.history||[])).toLowerCase();
      const platformAndroid=/\bandroi(?:d)?\b|android\s*(phone|điện thoại|app)?/.test(allContext);
      const platformIOS=/\b(ios|iphone|ipad)\b/.test(allContext);
      const platform=platformAndroid?"android":platformIOS?"ios":"web";
      const targetNote=platform==="android"
        ?"TARGET IS ANDROID. Do NOT switch to Web as the product target. Create a polished Android-style simulator preview of the requested app so it can be interacted with immediately in the browser. Preserve Android as the target; the browser preview is only a live simulator."
        :platform==="ios"
        ?"TARGET IS IOS. Preserve iOS as the product target; the browser preview is only a live simulator."
        :"TARGET IS WEB. Build the web product directly.";
      const existing=b.existingHtml?String(b.existingHtml):""; const editNote=existing?"\n\nEXISTING PRODUCT: Modify the current Live Preview in place. Preserve its features and platform. Do not start a new app. Return the complete updated HTML.\n\nCURRENT HTML:\n"+existing:"\n\nNO EXISTING PRODUCT: Build from scratch.";
      const buildPrompt=languageInstruction(b.prompt)+"\n\n"+contextText+"\n\n"+targetNote+editNote+"\n\n"+
"You are the SENIOR AI PRODUCT BUILDER inside an AI Software Factory. Do NOT produce a toy demo unless the user explicitly asks for a tiny demo. Think like a product designer, UX designer, frontend engineer and QA engineer working together. Before writing the HTML, internally create a product blueprint and use it to implement the product. Do not output the blueprint separately; output only the final HTML.\n\n"+
"PRODUCT QUALITY BAR:\n"+
"- Build a believable finished product, not a single-card mockup.\n"+
"- For a normal app, create a coherent multi-screen or multi-section experience with navigation, hierarchy, realistic demo data and meaningful interactions.\n"+
"- For a game, create a real gameplay loop with start state, active state, feedback, score/progress, success/failure state, restart/next actions and enough content to play multiple rounds.\n"+
"- For a dashboard/business app, include a polished overview, useful cards/tables/lists, filters or search when relevant, actions, empty/loading/error states and responsive layouts.\n"+
"- For a utility app, make the primary workflow immediately usable and include validation, result states, reset/edit actions and helpful feedback.\n"+
"- Use a consistent design system: typography scale, spacing, surfaces, borders, radii, buttons, badges, icons made with inline SVG/CSS when useful, focus/hover/pressed states and responsive breakpoints.\n"+
"- Include polished micro-interactions and transitions where they improve usability. Avoid excessive animation.\n"+
"- Design mobile-first when the target is mobile; make touch targets large and comfortable.\n"+
"- Never use lorem ipsum or meaningless placeholder buttons. Use realistic Vietnamese content when the user speaks Vietnamese.\n"+
"- Include navigation/back/close actions where screens or overlays exist. Every visible primary action must actually do something.\n"+
"- Handle loading, empty, success, error and invalid-input states where applicable.\n"+
"- Persist useful local state with localStorage when it makes sense, but gracefully recover if storage is unavailable.\n"+
"- Use accessible labels, semantic controls, keyboard support where appropriate, and visible focus states.\n"+
"- The first screen must immediately communicate what the product does and what the user should do next.\n"+
"- If the request is underspecified, make sensible product decisions instead of shrinking the app into a generic demo.\n\n"+
"PREMIUM PRODUCT DIRECTION:\n"+
"- Default to a premium, contemporary visual language comparable to polished consumer apps and modern SaaS products. Favor strong composition, visual hierarchy and intentional details over generic templates.\n"+
"- Use a distinctive hero/header area, purposeful navigation, meaningful cards or panels, refined controls and clear primary actions.\n"+
"- Use a restrained color palette with one strong accent, excellent contrast and subtle depth. Do not rely on random gradients.\n"+
"- Use CSS variables for the design system and keep the palette coherent across every screen.\n"+
"- Use 8px-style spacing rhythm, consistent corner radii and realistic typography sizing.\n"+
"- Add small details that make the product feel authored: status chips, avatars/initials, progress indicators, timestamps, contextual helper text, section labels, dividers, selected states and confirmation feedback when relevant.\n"+
"- Use inline SVG icons with consistent stroke/fill treatment rather than text glyphs for important navigation or actions.\n"+
"- Prefer composed layouts with asymmetry, grids, split panels, bottom sheets, tabs or timelines when the product calls for them. Avoid a stack of identical cards.\n"+
"- For mobile apps, create a convincing app shell with top bar, bottom navigation or contextual navigation, safe spacing and touch-friendly controls.\n"+
"- For games, create a visually rich game scene: title art made with CSS/SVG, character/avatar treatment, HUD, progress, animated feedback, reward states, polished start/result screens and tactile controls. The game should look like a real mini-game, not a quiz form.\n"+
"- For children’s games, use friendly illustrations made from CSS/SVG/emoji, large touch targets, joyful feedback and simple but polished visual storytelling.\n"+
"- For business apps, use realistic operational data, meaningful charts made with CSS/SVG, tables/lists, filters and clear status semantics.\n"+
"- For ecommerce/content apps, use product/content imagery simulated with polished CSS/SVG compositions, strong cards, pricing/meta hierarchy and clear conversion actions.\n"+
"- Use layered surfaces, subtle shadows and borders sparingly to create depth. Avoid flat white boxes everywhere.\n"+
"- Include at least one visually memorable signature element appropriate to the product.\n\n"+"VISUAL QUALITY BAR:\n"+
"- Aim for the visual density and polish of a modern production app: strong header/navigation, intentional spacing, layered surfaces, clear primary CTA, useful secondary actions, realistic content and responsive composition.\n"+
"- Do not make every section look like the same generic rounded card. Mix headers, lists, stats, controls, tabs, panels, sheets and content areas when appropriate.\n"+
"- Avoid giant empty spaces, tiny text, excessive gradients, default browser controls and obviously AI-generated placeholder layouts.\n\n"+
"IMPLEMENTATION CONSTRAINTS:\n"+
"- Return ONLY one complete HTML document starting with <!doctype html> and ending with </html>. No markdown fences and no explanation.\n"+
"- Use inline CSS and vanilla JavaScript only. No React, modules or build tools inside the preview.\n"+
"- No external scripts, styles, fonts, images, modules, CDN assets, network APIs, fetch calls to external services, parent-frame resources, window.parent, top, opener or import().\n"+
"- Everything required must be self-contained and work immediately inside the sandboxed Live Preview.\n"+
"- Use inline SVG/CSS shapes or emoji instead of remote images when visuals are needed.\n"+
"- Keep JavaScript defensive: initialize after DOMContentLoaded, check elements before use, avoid duplicate IDs, use event delegation or stable handlers, and catch recoverable storage/speech errors.\n"+
"- Do not request browser permissions. SpeechSynthesis is allowed when appropriate.\n"+
"- Preserve the existing product's platform, core features and useful existing UI when CURRENT HTML is supplied. Modify it in place instead of restarting from a blank template.\n"+
"- The preview must never be blank even if an optional feature fails.\n\n"+
"SELF-QA BEFORE RETURNING:\n"+
"- Mentally test the primary flow from first screen to completion.\n"+
"- Verify every major button has a handler and every navigation target exists.\n"+
"- Verify there are no obvious null-element errors, duplicate IDs or broken selectors.\n"+
"- Verify responsive behavior for narrow mobile width and desktop width.\n"+
"- Verify the initial state is useful and visually complete.\n"+
"- If a feature cannot be fully implemented without an external service, simulate it locally with realistic state and clearly keep it functional rather than leaving a dead button.\n\n"+
"USER REQUEST:\n"+b.prompt;
      const logs=[]; let last="";
      for(const p of ordered){logs.push("FREE Build Router → "+p.id+" / "+(p.model||"default"));try{
        const result=await call({...p,prompt:buildPrompt});
        const text=result.text;
        const html=text.replace(/^\s*```(?:html)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
        if(!/^<!doctype html>/i.test(html)||!/<\/html>\s*$/i.test(html))throw new Error("AI không trả về HTML preview hợp lệ.");
        logs.push("✓ "+p.id+" tạo preview OK");
        return NextResponse.json({ok:true,html,provider:p.id,platform,previewType:platform==="web"?"web-live":"device-simulator",logs,quota:result.quota||null});
      }catch(e){last=e.message;logs.push((transient(e.status)?"↪ ":"✕ ")+p.id+": "+e.message)}}
      logs.push("⚙ FREE providers unavailable → dùng Local Runtime fallback để Preview không bị trắng");
      const html=localPreview(b.prompt,platform,existing);
      return NextResponse.json({ok:true,html,provider:"local-runtime",platform,previewType:platform==="web"?"web-live":"device-simulator",fallback:true,logs,lastError:last},{status:200});
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
      plan:"You are the product planner and software architect. Do not rush into code. First create a concrete product scenario for the requested app. For games, define the target age, learning objective, core gameplay loop, player actions, question/content system, correct/incorrect feedback, scoring/progression, screens, difficulty, audio/touch behavior, edge cases, acceptance criteria and exactly what will be built in v1. For non-games, define users, roles, screens, data, API, security, deployment, risks and milestones. Separate MUST HAVE from optional ideas. Do not write implementation code. End with a clear approval gate: the user should be able to review what will be built and explicitly approve before Build starts. Ask only essential questions when a missing fact materially changes the product.",
      build:"You are the implementation engineer. Use the user's requirements and any existing plan/context to produce concrete implementation steps and code-oriented output. Prefer small verifiable changes.",
      review:"You are a senior reviewer. Inspect the provided requirements/output, identify bugs, missing requirements, security issues and architectural risks, then propose precise fixes."
    }[b.mode||"auto"];
    const routedPrompt=languageInstruction(b.prompt)+"\n\n"+conversationInstruction(b.history,b.prompt)+"\n\n"+workflow+"\n\nEXECUTION RULE: The user wants the easiest practical implementation. If context is sufficient, do not ask repetitive discovery questions; produce the next concrete step.\n";
    const logs=[]; let last="";
    for(const p of ordered){logs.push("FREE Router → "+p.id+" / "+(p.model||"default"));try{const result=await call({...p,prompt:routedPrompt});logs.push("✓ "+p.id+" OK");return NextResponse.json({text:result.text,provider:p.id,logs,quota:result.quota||null})}catch(e){last=e.message;logs.push((transient(e.status)?"↪ ":"✕ ")+p.id+": "+e.message)}}
    return NextResponse.json({error:"Tất cả nguồn FREE hiện không khả dụng. Không chuyển sang nguồn trả phí.",logs,lastError:last},{status:502});
  }catch(e){return NextResponse.json({error:e.message||"Server error"},{status:500})}
}
