import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME="/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME={".html":"text/html",".js":"text/javascript",".glb":"model/gltf-binary",".wasm":"application/wasm"};
const s=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=join(process.cwd(),p);if(!existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":MIME[extname(f)]||"application/octet-stream"});res.end(await readFile(f));});
await new Promise(r=>s.listen(8181,r));
const {default:P}=await import("../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const b=await P.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader"]});
const pg=await b.newPage();await pg.setViewport({width:1000,height:1000,deviceScaleFactor:2});
await pg.goto("http://localhost:8181/",{waitUntil:"networkidle0"});
const dl=Date.now()+20000;while(Date.now()<dl){if(await pg.evaluate(()=>(window.GAME?.enemies?.activeCount??0)>=6))break;await new Promise(r=>setTimeout(r,200));}
await pg.screenshot({path:"thumb.png"});
await b.close();s.close();console.log("thumb captured");
