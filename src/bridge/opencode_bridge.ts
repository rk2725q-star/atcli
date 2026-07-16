/**
 * OpenCode File Bridge Server
 * Runs in background while OpenCode is active.
 * - Auto-opens browser on start
 * - Drag-drop files/images ? injected into .opencode/instructions.md
 * - Images ? NVIDIA Vision API description (text OpenCode can understand)
 * - Delete button per upload
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

const BRIDGE_PORT = 7891;
const UPLOAD_DIR  = '.opencode/uploads';
const INSTR_FILE  = '.opencode/instructions.md';
const LOG_FILE    = '.opencode/.atcli_uploads.json';

// -- Vision API -------------------------------------------------------------------
// Uses NVIDIA vision model (llama-3.2-90b-vision-instruct) to describe images.
// Falls back to DeepSeek if NVIDIA key not set.
async function describeImage(buf: Buffer, filename: string): Promise<string|null> {
    try {
        const { ApiKeyStore } = await import('../providers/api-key-store');
        // Try nvidia key (primary and secondary)
        const key = ApiKeyStore.get('nvidia') || ApiKeyStore.get('nvidia2');
        if (!key) {
            console.log(`\n  ??  [Bridge] No NVIDIA key found. Add one: atcli > /api nvidia <key>`);
            console.log(`  ??  Without vision AI, OpenCode sees only the file path (not image content).`);
            return null;
        }
        const ext = path.extname(filename).replace('.','').toLowerCase();
        const mime = ext==='png'?'image/png':ext==='gif'?'image/gif':ext==='webp'?'image/webp':'image/jpeg';
        const b64  = buf.toString('base64');
        const body = JSON.stringify({
            model:'nvidia/llama-3.2-90b-vision-instruct',
            messages:[{role:'user',content:[
                {type:'image_url',image_url:{url:`data:${mime};base64,${b64}`}},
                {type:'text',text:'Describe this image in detail for a developer. Include UI layout, components, colors, any text/code visible, error messages, design patterns. Be thorough.'}
            ]}],
            max_tokens:1024,temperature:0.3
        });
        return await new Promise(resolve=>{
            const https=require('https');
            const req=https.request({hostname:'integrate.api.nvidia.com',port:443,path:'/v1/chat/completions',method:'POST',
                headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},
                (res:any)=>{let d='';res.on('data',(c:any)=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d).choices?.[0]?.message?.content||null);}catch{resolve(null);}});});
            req.on('error',()=>resolve(null));req.write(body);req.end();
        });
    } catch { return null; }
}

// -- Upload log ----------------------------------------------------------------
interface Entry { id:string;filename:string;savedAs:string;content:string;timestamp:number;isImage:boolean; }
const readLog=(cwd:string):Entry[]=>{ try{return JSON.parse(fs.readFileSync(path.join(cwd,LOG_FILE),'utf-8'));}catch{return[];} };
const writeLog=(cwd:string,e:Entry[])=>fs.writeFileSync(path.join(cwd,LOG_FILE),JSON.stringify(e,null,2),'utf-8');
function rebuild(cwd:string,entries:Entry[],base:string){
    const sec=entries.length?`<!-- ATCLI_UPLOADS_START -->\n## Uploaded via ATCLI Bridge\n\n${entries.map(e=>e.content).join('\n\n---\n\n')}\n<!-- ATCLI_UPLOADS_END -->`:'';
    const clean=base.replace(/<!-- ATCLI_UPLOADS_START -->[\s\S]*?<!-- ATCLI_UPLOADS_END -->/g,'').trim();
    const dir=path.dirname(path.join(cwd,INSTR_FILE));
    if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(cwd,INSTR_FILE),`${clean}\n\n${sec}\n`,'utf-8');
}

// -- File helpers --------------------------------------------------------------
const isImg =(f:string)=>/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i.test(f);
const isTxt =(f:string)=>/\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|css|scss|html|json|yaml|yml|toml|md|txt|sh|bat|env|sql|xml|vue|svelte)$/i.test(f);
const lang  =(f:string)=>{const m:Record<string,string>={ts:'typescript',tsx:'tsx',js:'javascript',jsx:'jsx',py:'python',rs:'rust',go:'go',css:'css',scss:'scss',html:'html',json:'json',yaml:'yaml',yml:'yaml',md:'markdown',sh:'bash',sql:'sql',vue:'vue',svelte:'svelte'};return m[path.extname(f).replace('.','')]||'text';};
function parseMP(body:Buffer,boundary:string):{filename:string;data:Buffer}|null{
    const bb=Buffer.from('--'+boundary);
    const s=body.indexOf(bb)+bb.length+2;
    const he=body.indexOf(Buffer.from('\r\n\r\n'),s);if(he===-1)return null;
    const m=body.slice(s,he).toString().match(/filename="([^"]+)"/);if(!m)return null;
    const ds=he+4;const eb=Buffer.from('\r\n--'+boundary);const de=body.indexOf(eb,ds);
    return{filename:m[1],data:body.slice(ds,de===-1?undefined:de)};
}
function openBrowser(url:string){
    const c=process.platform==='win32'?`start "" "${url}"`:process.platform==='darwin'?`open "${url}"`:`xdg-open "${url}"`;
    exec(c,()=>{});
}

// -- HTML UI -------------------------------------------------------------------
const HTML=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>ATCLI Bridge</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 20px}.logo{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#444;margin-bottom:6px}h1{font-size:22px;font-weight:700;color:#fff;margin-bottom:4px}.sub{font-size:13px;color:#555;margin-bottom:22px}.badge{background:#0f2a0f;color:#4caf50;border:1px solid #1e4a1e;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;margin-bottom:26px;display:flex;align-items:center;gap:7px}.dot{width:7px;height:7px;background:#4caf50;border-radius:50%;animation:p 1.5s infinite}@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}.dz{width:100%;max-width:580px;border:2px dashed #222;border-radius:14px;padding:52px 32px;text-align:center;cursor:pointer;transition:all .2s;background:#111;margin-bottom:22px}.dz:hover,.dz.over{border-color:#4f8ef7;background:#0d1a2e}.di{font-size:40px;margin-bottom:14px}.dl{font-size:15px;color:#999;margin-bottom:6px}.dh{font-size:12px;color:#444}#fi{display:none}.log{width:100%;max-width:580px}.lt{font-size:11px;color:#444;margin-bottom:10px;letter-spacing:1px;text-transform:uppercase}.ll{list-style:none}.li{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:#111;border-radius:10px;margin-bottom:8px;font-size:13px;border:1px solid #1a1a1a;transition:all .2s}.li:hover{border-color:#2a2a2a}.th{width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #222;flex-shrink:0}.ic{font-size:20px;flex-shrink:0;margin-top:2px}.ii{flex:1;min-width:0}.in{color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.im{color:#555;font-size:11px;margin-top:3px;line-height:1.5}.ih{color:#4f8ef7;font-size:11px;margin-top:4px;font-style:italic}.ir{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}.st{font-size:11px;font-weight:700;white-space:nowrap}.ok{color:#4caf50}.er{color:#f44336}.ld{color:#888}.db{background:transparent;border:1px solid #2a2a2a;color:#666;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer;transition:all .15s}.db:hover{background:#2a1010;border-color:#5a2020;color:#f44336}.en{color:#444;font-size:13px;text-align:center;padding:20px}.hw{width:100%;max-width:580px;background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:16px 20px;font-size:12px;color:#555;line-height:2;margin-top:16px}.hw strong{color:#888}.hw code{background:#1a1a1a;border-radius:4px;padding:1px 6px;color:#4f8ef7;font-family:monospace}.sp{display:inline-block;width:12px;height:12px;border:2px solid #333;border-top-color:#4f8ef7;border-radius:50%;animation:s .7s linear infinite;margin-right:4px;vertical-align:middle}@keyframes s{to{transform:rotate(360deg)}}</style></head><body>
<div class="logo">ATCLI Bridge</div><h1>OpenCode File Upload</h1><p class="sub">Drop files or images � OpenCode sees them automatically</p>
<div class="badge"><span class="dot"></span>LIVE � OpenCode is running</div>
<div class="dz" id="dz"><input type="file" id="fi" multiple/><div class="di">??</div><div class="dl">Drop files or images here</div><div class="dh">or click to browse � any file type</div></div>
<div class="log"><div class="lt">Upload Log</div><ul class="ll" id="ll"></ul></div>
<div class="hw"><strong>Images:</strong> AI vision analyzes ? OpenCode gets a text description it can understand.<br/><strong>Code files:</strong> Full content injected as code blocks.<br/>After upload, tell OpenCode: <code>I uploaded a file, please review it</code><br/><strong>Delete:</strong> Click ?? to remove a wrong upload from OpenCode's context.</div>
<script>
const dz=document.getElementById('dz'),fi=document.getElementById('fi'),ll=document.getElementById('ll');
fetch('/uploads').then(r=>r.json()).then(renderAll);
dz.addEventListener('click',()=>fi.click());
fi.addEventListener('change',e=>go(e.target.files));
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');go(e.dataTransfer.files)});
function renderAll(a){ll.innerHTML='';if(!a.length){ll.innerHTML='<li class="li en">No uploads yet</li>';return;}a.slice().reverse().forEach(e=>addItem(e,false));}
function addItem(e,pre=true){
  const li=document.createElement('li');li.className='li';li.dataset.id=e.id;
  const img=e.isImage;
  const med=img?\`<img class="th" src="/thumb/\${e.savedAs}" onerror="this.style.display='none'"/>\`:\`<span class="ic">\${e.filename.match(/\\.(ts|tsx|js|jsx)$/)?\`??\`:\`??\`}</span>\`;
  li.innerHTML=\`\${med}<div class="ii"><div class="in">\${e.filename}</div><div class="im">\${img?\`??? Vision-described\`:\`?? Injected\`} � \${new Date(e.timestamp).toLocaleTimeString()}</div><div class="ih">Tell OpenCode: "I uploaded a file, please review it"</div></div><div class="ir"><span class="st ok">? Injected</span><button class="db" onclick="del('\${e.id}',this)">?? Delete</button></div>\`;
  if(pre)ll.prepend(li);else ll.appendChild(li);
  const en=ll.querySelector('.en');if(en)en.remove();
}
async function go(files){
  for(const f of files){
    const li=document.createElement('li');li.className='li';
    li.innerHTML=\`<span class="ic">\${f.type.startsWith('image/')?\`???\`:\`??\`}</span><div class="ii"><div class="in">\${f.name}</div><div class="im">\${f.type.startsWith('image/')?\`<span class="sp"></span>Analyzing with AI vision...\`:\`Processing...\`}</div></div><div class="ir"><span class="st ld">?</span></div>\`;
    ll.prepend(li);const en=ll.querySelector('.en');if(en)en.remove();
    const fd=new FormData();fd.append('file',f,f.name);
    try{const r=await fetch('/upload',{method:'POST',body:fd});const j=await r.json();
      if(j.ok){li.remove();addItem(j.entry,true);}
      else{li.querySelector('.st').textContent='? '+j.error;li.querySelector('.st').className='st er';li.querySelector('.im').textContent=j.error||'Failed';}
    }catch(e){li.querySelector('.st').textContent='? Error';li.querySelector('.st').className='st er';}
  }
}
async function del(id,btn){
  btn.textContent='...';btn.disabled=true;
  try{const r=await fetch('/delete/'+id,{method:'DELETE'});const j=await r.json();
    if(j.ok){const li=document.querySelector('[data-id="'+id+'"]');if(li){li.style.opacity='0';li.style.transition='opacity .3s';setTimeout(()=>{li.remove();if(!ll.querySelector('.li:not(.en)'))ll.innerHTML='<li class="li en">No uploads yet</li>';},300);}}
  }catch(e){btn.textContent='?? Delete';btn.disabled=false;}
}
</script></body></html>`;

// -- Main ----------------------------------------------------------------------
export interface BridgeServer { stop:()=>void; port:number; }

export function startOpenCodeBridge(cwd:string):BridgeServer {
    const uploadDir=path.join(cwd,UPLOAD_DIR);
    if(!fs.existsSync(uploadDir))fs.mkdirSync(uploadDir,{recursive:true});
    const instrPath=path.join(cwd,INSTR_FILE);
    let baseCtx='';
    if(fs.existsSync(instrPath))baseCtx=fs.readFileSync(instrPath,'utf-8');
    writeLog(cwd,[]);

    const server=http.createServer(async(req,res)=>{
        const url=req.url||'/';
        res.setHeader('Access-Control-Allow-Origin',"http://localhost:${BRIDGE_PORT}");

        if(req.method==='GET'&&url==='/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(HTML);return;}
        if(req.method==='GET'&&url==='/uploads'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(readLog(cwd)));return;}

        if(req.method==='GET'&&url.startsWith('/thumb/')){
            const fn=decodeURIComponent(url.slice('/thumb/'.length));
            const p=path.resolve(uploadDir,fn);
            // Path traversal guard: reject any path escaping uploadDir
            if(!p.startsWith(uploadDir+path.sep)||p===uploadDir){res.writeHead(403);res.end();return;}
            if(fs.existsSync(p)){const ext=path.extname(fn).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.gif'?'image/gif':ext==='.webp'?'image/webp':'image/jpeg';res.writeHead(200,{'Content-Type':mime});res.end(fs.readFileSync(p));}
            else{res.writeHead(404);res.end();}return;
        }

        if(req.method==='POST'&&url==='/upload'){
            const ct=req.headers['content-type']||'';const bm=ct.match(/boundary=(.+)/);
            if(!bm){res.writeHead(400);res.end(JSON.stringify({ok:false,error:'No boundary'}));return;}
            const chunks:Buffer[]=[];req.on('data',(c:Buffer)=>chunks.push(c));
            req.on('end',async()=>{
                const parsed=parseMP(Buffer.concat(chunks),bm[1]);
                if(!parsed){res.writeHead(400);res.end(JSON.stringify({ok:false,error:'Parse failed'}));return;}
                const{filename,data}=parsed;
                const id=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
                const safe=`${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
                fs.writeFileSync(path.join(uploadDir,safe),data);
                const imgFile=isImg(filename);let content='';
                if(imgFile){
                    console.log(`\n  ?? [Bridge] Vision AI analyzing: ${filename}...`);
                    const desc=await describeImage(data,filename);
                    if(desc){content=`### Image: ${filename}\n**AI Vision Description:**\n\n${desc}\n\n*File saved at \`.opencode/uploads/${safe}\`*`;console.log(`  ? [Bridge] Vision done: ${filename}`);}
                    else{content=`### Image: ${filename}\n*Saved at \`.opencode/uploads/${safe}\`*\n*(Add NVIDIA key via /api nvidia <key> to enable vision descriptions)*`;}
                } else if(isTxt(filename)){
                    const txt=data.toString('utf-8');content=`### File: ${filename}\n\`\`\`${lang(filename)}\n${txt.substring(0,8000)}\n\`\`\`${txt.length>8000?'\n*(truncated)*':''}`;
                } else {content=`### File: ${filename}\nSaved at \`.opencode/uploads/${safe}\` � ${data.length} bytes`;}
                const entry:Entry={id,filename,savedAs:safe,content,timestamp:Date.now(),isImage:imgFile};
                const entries=readLog(cwd);entries.push(entry);writeLog(cwd,entries);rebuild(cwd,entries,baseCtx);
                console.log(`\n  ?? [Bridge] Injected: ${filename}`);
                res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,entry}));
            });return;
        }

        if(req.method==='DELETE'&&url.startsWith('/delete/')){
            const id=url.replace('/delete/','');let entries=readLog(cwd);
            const e=entries.find(x=>x.id===id);
            if(e){
                const fp=path.join(uploadDir,e.savedAs);
                try{if(fs.existsSync(fp))fs.unlinkSync(fp);}catch{}
                entries=entries.filter(x=>x.id!==id);writeLog(cwd,entries);rebuild(cwd,entries,baseCtx);
                console.log(`\n  ???  [Bridge] Deleted: ${e.filename}`);
                res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));
            } else {res.writeHead(404);res.end(JSON.stringify({ok:false,error:'Not found'}));}
            return;
        }
        res.writeHead(404);res.end();
    });

    server.listen(BRIDGE_PORT,'127.0.0.1',()=>{
        const url=`http://localhost:${BRIDGE_PORT}`;
        console.log(`\n  ?? [ATCLI Bridge] \x1b[36m${url}\x1b[0m � opening browser...`);
        setTimeout(()=>openBrowser(url),600);
    });
    server.on('error',(err:any)=>{if(err.code==='EADDRINUSE'){setTimeout(()=>openBrowser(`http://localhost:${BRIDGE_PORT}`),200);}});
    return{stop:()=>server.close(),port:BRIDGE_PORT};
}
