import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME="/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME={".html":"text/html",".js":"text/javascript",".glb":"model/gltf-binary",".wasm":"application/wasm"};
const s=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=join(process.cwd(),p);if(!existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":MIME[extname(f)]||"application/octet-stream"});res.end(await readFile(f));});
await new Promise(r=>s.listen(8188,r));
const {default:P}=await import("../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const b=await P.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push("ERR:"+e.message));
await pg.goto("http://localhost:8188/",{waitUntil:"networkidle0"});await new Promise(r=>setTimeout(r,1200));
const r=await pg.evaluate(()=>{
  const g=window.GAME; g.loop.stop();
  let bossStep=-1, samples=[];
  for(let i=0;i<900;i++){
    const preState=g.state;
    g.update(1/60);
    if(preState==="run" && g.state==="boss") bossStep=i;
    // once in boss, sample bullets + bossHp each 30 steps for ~2s
    if(g.state==="boss" && bossStep>=0 && (i-bossStep)%20===0 && (i-bossStep)<=120){
      samples.push({t:+((i-bossStep)/60).toFixed(2), bullets:g.bullets.activeCount, bossHp:Math.round(g.boss?g.boss.hp:-1), squadZ:+g.squad.z.toFixed(1)});
    }
    if(g.state==="levelcomplete") break;
  }
  return {bossStep, fireInterval:g.squad.fireInterval, samples};
});
await b.close();s.close();
console.log("boss entered at step",r.bossStep,"fireInterval",r.fireInterval);
r.samples.forEach(x=>console.log(" t="+x.t+"s bullets="+x.bullets+" bossHp="+x.bossHp));
console.log("errors:",errs.length?errs:"none");
