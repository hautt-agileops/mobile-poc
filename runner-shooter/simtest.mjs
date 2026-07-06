import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME="/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME={".html":"text/html",".js":"text/javascript",".glb":"model/gltf-binary",".wasm":"application/wasm"};
const s=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=join(process.cwd(),p);if(!existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":MIME[extname(f)]||"application/octet-stream"});res.end(await readFile(f));});
await new Promise(r=>s.listen(8187,r));
const {default:P}=await import("../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const b=await P.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push("PAGEERR:"+e.message));pg.on("console",m=>m.type()==="error"&&errs.push(m.text()));
await pg.goto("http://localhost:8187/",{waitUntil:"networkidle0"});await new Promise(r=>setTimeout(r,1200));
const r=await pg.evaluate(()=>{
  const g=window.GAME; g.loop.stop();            // stop rAF; drive sim by hand
  g.squad.count=30; g._enterBoss();
  const hp0=g.boss.hp; let maxAdds=0, sawContactDrop=false; const c0=g.squad.count;
  for(let i=0;i<600;i++){ g.update(1/60); maxAdds=Math.max(maxAdds,g.enemies.activeCount); if(g.state!=="boss")break; }
  return {hp0:Math.round(hp0), state:g.state, level:g.level, maxAdds, countBefore:c0, countAfter:Math.floor(g.squad.count)};
});
await b.close();s.close();
console.log(JSON.stringify(r)); console.log("errors:",errs.length?errs:"none");
console.log(r.state==="levelcomplete"&&r.maxAdds>0&&!errs.length?"BOSS LOGIC OK ✓ (killed boss, adds spawned)":"CHECK ✗");
