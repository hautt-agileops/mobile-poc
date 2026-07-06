import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME="/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME={".html":"text/html",".js":"text/javascript",".glb":"model/gltf-binary",".wasm":"application/wasm"};
const s=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=join(process.cwd(),p);if(!existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":MIME[extname(f)]||"application/octet-stream"});res.end(await readFile(f));});
await new Promise(r=>s.listen(8189,r));
const {default:P}=await import("../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const b=await P.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push("ERR:"+e.message));
await pg.goto("http://localhost:8189/",{waitUntil:"networkidle0"});await new Promise(r=>setTimeout(r,1200));
const r=await pg.evaluate(()=>{
  const g=window.GAME; g.loop.stop();
  g.squad.count=120; g._enterBoss();
  const out=[];
  for(let i=0;i<180;i++){ g.update(1/60);
    if(i%30===0) out.push({t:+(i/60).toFixed(1),state:g.state,bullets:g.bullets.activeCount,bossHp:Math.round(g.boss?g.boss.hp:-1),count:Math.floor(g.squad.count)});
  }
  return out;
});
await b.close();s.close();
r.forEach(x=>console.log(JSON.stringify(x)));console.log("errors:",errs.length?errs:"none");
