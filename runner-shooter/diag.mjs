import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME="/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME={".html":"text/html",".js":"text/javascript",".glb":"model/gltf-binary",".wasm":"application/wasm"};
const s=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=join(process.cwd(),p);if(!existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":MIME[extname(f)]||"application/octet-stream"});res.end(await readFile(f));});
await new Promise(r=>s.listen(8179,r));
const {default:P}=await import("../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const b=await P.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader"]});
const pg=await b.newPage();await pg.goto("http://localhost:8179/",{waitUntil:"networkidle0"});
await new Promise(r=>setTimeout(r,3000));
const d=await pg.evaluate(()=>{const g=window.GAME,sp=g.soldiers;const r0=sp.data[0];
 const bb=sp.mesh.geometry.boundingBox;sp.mesh.geometry.computeBoundingBox();
 const m=sp.mesh.material;
 return {soldierModelLoaded:!!g.models.soldier, soldierYOff:g._soldierYOff, cap:sp.capacity, meshCount:sp.mesh.count,
  rec0:{x:r0.x,y:r0.y,z:r0.z}, squadZ:g.squad.z, squadCount:g.squad.count,
  geoBox:sp.mesh.geometry.boundingBox, matType:m.type, matColor:m.color?.getHexString?.(), hasMap:!!m.map, transparent:m.transparent, opacity:m.opacity, visible:sp.mesh.visible, inScene:!!sp.mesh.parent};});
console.log(JSON.stringify(d,null,1));await b.close();s.close();
