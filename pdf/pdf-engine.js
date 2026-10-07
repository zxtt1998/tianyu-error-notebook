(function(){
'use strict';
const PW=595.28,PH=841.89,SCALE=2,PREFIX='TYNOTEBOOK-PDF-v1|';
const pause=()=>new Promise(r=>setTimeout(r,0));
function encode(value){const bytes=new TextEncoder().encode(JSON.stringify(value));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function pageCode(id,page){let h=2166136261;for(const c of id+':'+page){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(2).padStart(32,'0')}
function decode(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))))}
// The document uses vector text and lines. Raster assets retain their original pixels.
const toolsLoading=new Map();
async function localTool(src,name){if(window[name])return window[name];if(!toolsLoading.has(src))toolsLoading.set(src,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/'+src;s.onload=()=>window[name]?resolve(window[name]):reject(Error('PDF定位工具不完整，请更新离线下载。'));s.onerror=()=>{s.remove();reject(Error('PDF定位工具加载失败，请联网重试或更新离线下载。'))};document.head.append(s)}).catch(e=>{toolsLoading.delete(src);throw e}));return toolsLoading.get(src)}
function recoveryPayload(m,item,q){const raw=new Uint8Array(30);raw.set([3,m.subject==='technical'?1:m.subject==='consolidation'?3:2,Number(q.paper),Number(q.number),item.page>>8,item.page&255,m.totalPages>>8,m.totalPages&255,m.items.length>>8,m.items.length&255]);raw.set(m.id.replace(/-/g,'').match(/../g).map(v=>parseInt(v,16)),10);const code=parseInt(item.code,2)>>>0;raw.set([code>>>24,(code>>>16)&255,(code>>>8)&255,code&255],26);return 'TY2:'+btoa(String.fromCharCode(...raw))}
function parseRecovery(value){if(!/^TY2:[A-Za-z0-9+/]+=*$/.test(value))return null;let b;try{b=Uint8Array.from(atob(value.slice(4)),c=>c.charCodeAt(0))}catch{return null}if(!((b.length===26&&b[0]===2)||(b.length===30&&b[0]===3))||![1,2,3].includes(b[1]))return null;const hex=[...b.slice(10,26)].map(n=>n.toString(16).padStart(2,'0')).join(''),id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);return {code:b.length===30?(((b[26]<<24)|(b[27]<<16)|(b[28]<<8)|b[29])>>>0).toString(2).padStart(32,'0'):undefined,subject:b[1]===1?'technical':b[1]===3?'consolidation':'practical',paper:b[2],number:b[3],page:(b[4]<<8)|b[5],totalPages:(b[6]<<8)|b[7],totalChoices:(b[8]<<8)|b[9],id}}
function addRecoveryMarks(doc,m,questions){const byId=new Map(questions.map(q=>[q.id,q]));for(const item of m.items){const qr=window.qrcode(0,'M');qr.addData(recoveryPayload(m,item,byId.get(item.id)),'Byte');qr.make();const n=qr.getModuleCount(),cell=Math.min(1.1,37/(n+4)),page=doc.getPage(item.page),top=4,x=508;page.drawRectangle({x,y:PH-top-(n+4)*cell,width:(n+4)*cell,height:(n+4)*cell,color:PDFLib.rgb(1,1,1)});for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(qr.isDark(row,col))page.drawRectangle({x:x+(col+2)*cell,y:PH-top-(row+3)*cell,width:cell,height:cell,color:PDFLib.rgb(0,0,0)})}}
async function recoverManifest(bytes,{bankFor,onProgress=()=>{}}={}){
 const decoder=await localTool('jsQR.js','jsQR'),info=await readManifest(bytes),pdfjs=await import('./vendor/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',location.href).href;
 const pdf=await pdfjs.getDocument({data:bytes.slice(),useWasm:false,isEvalSupported:false}).promise;let identity,bank;const items=[],seen=new Set();
 try{for(let index=0;index<pdf.numPages;index++){
  const page=await pdf.getPage(index+1),viewport=page.getViewport({scale:SCALE,rotation:0});if(Math.abs(viewport.width/SCALE-PW)>2||Math.abs(viewport.height/SCALE-PH)>2)throw Error('PDF页面尺寸已改变，请保留导出页面尺寸。');
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport,annotationMode:pdfjs.AnnotationMode.ENABLE}).promise;const crop=ctx.getImageData(478*SCALE,0,80*SCALE,61*SCALE),code=decoder(crop.data,crop.width,crop.height,{inversionAttempts:'dontInvert'}),mark=code&&parseRecovery(code.data);canvas.width=1;canvas.height=1;page.cleanup();
  if(mark){if(mark.page!==index||mark.totalPages!==info.pages)throw Error('PDF页数或顺序已改变，不能可靠定位题目。');if(!identity){identity=mark;bank=await bankFor(mark.subject)}else if(mark.id!==identity.id||mark.subject!==identity.subject||mark.totalChoices!==identity.totalChoices)throw Error('PDF中混入了不同练习的页面，请使用同一次导出的文件。');const q=bank.questions.find(q=>Number(q.paper)===mark.paper&&Number(q.number)===mark.number);if(!q||q.type==='short'||seen.has(q.id))throw Error('页面题号重复或与当前题库不匹配。');seen.add(q.id);const boxes={};Object.keys(q.options).forEach((letter,i)=>boxes[letter]=[88+i*91,647,27]);items.push({id:q.id,page:index,boxes,code:mark.code||pageCode(mark.id,index)})}
  onProgress(index+1,pdf.numPages,'恢复页面定位');await pause();
 }}finally{await pdf.destroy()}
 if(!identity)throw Error('这份PDF没有可读取的定位信息。旧版PDF请同时选择当时的原始文件；没有原文件时，需要恢复定位后再导入。');
 if(items.length!==identity.totalChoices)throw Error('部分题目的定位二维码无法读取，请勿遮盖右上角标记；也可同时选择原始PDF。');
 return {version:1,id:identity.id,subject:identity.subject,width:PW,height:PH,totalPages:info.pages,questionIds:items.map(i=>i.id),items,recoveredFrom:'page-qr'};
}

let fontPromise;
async function fontData(){
 if(!fontPromise)fontPromise=(async()=>{
  if(!window.fontkit)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/fontkit.umd.min.js';s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('字体工具加载失败，请联网重试或更新完整离线下载。'))};document.head.append(s)});
  return Promise.all(['NotebookSans-Regular.ttf','NotebookSans-Semibold.ttf'].map(async name=>{const r=await fetch('vendor/'+name);if(!r.ok)throw Error('中文字体加载失败，请联网重试或更新完整离线下载。');return new Uint8Array(await r.arrayBuffer())}));
 })().catch(e=>{fontPromise=null;throw e});
 return fontPromise;
}
async function makePdf({questions,subject,solutions=false,onProgress=()=>{}}){
 onProgress(0,questions.length,'准备清晰文字');
 const [bytes]=await Promise.all([fontData(),localTool('qrcode.js','qrcode')]),doc=await PDFLib.PDFDocument.create();doc.registerFontkit(window.fontkit);
 const regular=await doc.embedFont(bytes[0],{subset:true}),semibold=await doc.embedFont(bytes[1],{subset:true}),fonts=[regular,semibold];
 const manifest={version:1,id:crypto.randomUUID(),subject,width:PW,height:PH,items:[],questionIds:questions.map(q=>q.id)},label=subject==='technical'?'安全生产技术':subject==='consolidation'?'安全技术巩固':'其他安全专业实务';
 const rgb=PDFLib.rgb,ink=rgb(23/255,43/255,67/255),muted=rgb(98/255,113/255,134/255),images=new Map(),supported=new Set(regular.getCharacterSet());
 let page=null,y,current='',pageNumber=0;
 function clean(value){const text=String(value??'').replace(/\\n/g,'\n').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\t/g,'  ').replace(/\r/g,'');for(const char of text)if(char!=='\n'&&!supported.has(char.codePointAt(0)))throw Error('字库缺少字符“'+char+'”，请更新离线题库后重试。');return text}
 function draw(value,x,top,size=14,bold=false,color=ink){if(value)page.drawText(clean(value),{x,y:PH-top,size,font:fonts[Number(bold)],color})}
 function line(x1,top1,x2,top2,color,width=.5){page.drawLine({start:{x:x1,y:PH-top1},end:{x:x2,y:PH-top2},color,thickness:width})}
 function begin(title){page=doc.addPage([PW,PH]);draw('李天宇 · '+label+' · 手写练习',40,33,11,true);draw(title,40,52,10);line(40,61,PW-40,61,rgb(211/255,219/255,229/255));y=82;current=title}
 async function flush(){if(!page)return;const item=manifest.items.find(i=>i.page===doc.getPageCount()-1);if(item){item.code=pageCode(manifest.id,item.page);for(let i=0;i<32;i++)if(item.code[i]==='1')page.drawRectangle({x:482+i*2,y:PH-48,width:2,height:5,color:rgb(0,0,0)})}draw('练习编号 '+manifest.id.slice(0,8)+' · 第 '+(++pageNumber)+' 页',40,818,9,false,muted);page=null;await pause()}
 async function room(height,limit=600){if(y+height>limit){await flush();begin(current+'（续页）')}}
 async function text(value,{size=14,line:leading=22,bold=false,indent=0,limit=600}={}){const source=clean(value),font=fonts[Number(bold)],max=PW-80-indent;for(const paragraph of source.split('\n')){let row='',width=0;const rows=[];for(const char of paragraph){const w=font.widthOfTextAtSize(char,size);if(row&&width+w>max){rows.push(row);row=char;width=w}else{row+=char;width+=w}}rows.push(row);for(const row of rows){await room(leading,limit);draw(row,40+indent,y,size,bold);y+=leading}}}
 async function asset(src){if(!images.has(src)){const r=await fetch(src);if(!r.ok)throw Error('题目配图加载失败，请联网重试或更新离线下载。');const b=new Uint8Array(await r.arrayBuffer());images.set(src,b[0]===137&&b[1]===80?await doc.embedPng(b):await doc.embedJpg(b))}return images.get(src)}
 async function pictures(list=[]){for(const im of list){const image=await asset(im.src);let w=Math.min(420,image.width),h=w*image.height/image.width;if(h>210){h=210;w=h*image.width/image.height}await room(h+20);page.drawImage(image,{x:40,y:PH-(y-8)-h,width:w,height:h});y+=h+16}}
 function writing(top=699,label='我的笔记'){draw(label,40,top,11,false,muted);for(let yy=top+24;yy<800;yy+=24)line(40,yy,PW-40,yy,rgb(220/255,227/255,235/255))}
 for(let index=0;index<questions.length;index++){
  const q=questions[index],title=`第${q.paper}套 · 原题${q.number} · ${q.type==='short'?'案例简答':q.type==='single'?'单选':'多选'}`;begin(title);
  if(q.type==='short'){
   await text(q.material,{size:13,line:21,limit:780});await pictures(q.images);await flush();
   for(const part of q.parts){begin(title+' · 第'+part.number+'小问');await text(part.prompt,{bold:true,size:15,line:24,limit:450});writing(Math.max(180,y+25),'我的作答');await flush()}
  }else{
   await text(q.stem,{size:14,line:23});y+=7;await pictures(q.images);
   for(const [letter,value] of Object.entries(q.options)){await text(letter+'. '+value,{size:13,line:22,indent:10});await pictures(q.optionImages?.[letter]);y+=7}
   if(y>600){await flush();begin(title+'（作答页）')}
   draw('作答区：用深色笔在框内打勾或涂黑，改答案请擦除原标记。',40,625,11,false,muted);
   const boxes={};Object.keys(q.options).forEach((letter,i)=>{const x=88+i*91,top=647,size=27;draw(letter,x-22,top+20,15);page.drawRectangle({x,y:PH-top-size,width:size,height:size,borderColor:rgb(148/255,163/255,184/255),borderWidth:.8});boxes[letter]=[x,top,size]});
   manifest.items.push({id:q.id,page:doc.getPageCount()-1,boxes});writing();await flush();
  }
  onProgress(index+1,questions.length,'生成题目');
 }
 if(solutions)for(let index=0;index<questions.length;index++){
  const q=questions[index];begin(`参考答案与解析 · 第${q.paper}套原题${q.number}`);
  if(q.type==='short'){for(const part of q.parts){await text('第'+part.number+'小问：'+part.prompt,{bold:true,size:14,line:23,limit:770});await text(part.referenceAnswer,{size:13,line:22,limit:770});await pictures(part.referenceImages);y+=15}}
  else{await text('正确答案：'+q.answer.join('、'),{bold:true,size:16,line:26,limit:770});await text(q.explanation||'原卷未提供文字解析。',{size:13,line:22,limit:770});await pictures(q.explanationImages)}
  await flush();onProgress(index+1,questions.length,'生成解析');
 }
 manifest.totalPages=doc.getPageCount();addRecoveryMarks(doc,manifest,questions);doc.setTitle('李天宇 · '+label+' · '+(solutions?'题目与解析':'手写练习'));doc.setAuthor('个人错题本');doc.setSubject('在固定答题框内作答，其他空白可自由手写。');doc.setKeywords([PREFIX+encode(manifest)]);
 return {bytes:await doc.save(),manifest};
}
async function readManifest(bytes){const doc=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false});const keywords=doc.getKeywords()||'';if(!keywords.startsWith(PREFIX))return {manifest:null,pages:doc.getPageCount()};let manifest;try{manifest=decode(keywords.slice(PREFIX.length).replace(/\s/g,''))}catch{throw Error('PDF识别信息损坏，请同时选择原始导出的PDF。')}return {manifest,pages:doc.getPageCount()}}
async function scanPdf(bytes,{originalBytes,bank,manifestOverride,onProgress=()=>{}}={}){
 let info=await readManifest(bytes),m=info.manifest;if(!m&&originalBytes)m=(await readManifest(originalBytes)).manifest;
 if(!m&&manifestOverride)m=manifestOverride;
 if(!m)throw Error('请导入本工具导出的作答PDF。若书写软件移除了识别信息，请同时选择原始PDF。');
 const byId=new Map(bank.questions.map(q=>[q.id,q]));
 if(m.version!==1||m.subject!==bank.subject||m.totalPages!==info.pages||!Array.isArray(m.items)||!m.items.length||m.items.length>600||m.width!==PW||m.height!==PH)throw Error('PDF页数或格式不匹配；仅支持本工具导出的选择题PDF，请勿增删或重排页面。');
 const ids=new Set();for(const item of m.items){const q=byId.get(item.id);if(!q||q.type==='short'||ids.has(item.id)||!Number.isInteger(item.page)||item.page<0||item.page>=info.pages)throw Error('题目识别信息不匹配。');ids.add(item.id);if(typeof item.code!=='string'||!/^[01]{32}$/.test(item.code))throw Error('页面定位标记不匹配，请重新导出PDF。');if(Object.keys(item.boxes||{}).sort().join('')!==Object.keys(q.options).sort().join(''))throw Error('答题框信息不匹配。');for(const box of Object.values(item.boxes))if(!Array.isArray(box)||box.length!==3||box.some(n=>!Number.isFinite(n))||box[0]<40||box[0]+box[2]>PW-40||box[1]<60||box[1]+box[2]>PH-40||box[2]<15||box[2]>35)throw Error('答题框坐标不匹配。');}
 const pdfjs=await import('./vendor/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',location.href).href;
 const pdf=await pdfjs.getDocument({data:bytes.slice(),useWasm:false,isEvalSupported:false}).promise,rows=[];
 try{for(let index=0;index<m.items.length;index++){
  const item=m.items[index],q=byId.get(item.id),page=await pdf.getPage(item.page+1),viewport=page.getViewport({scale:SCALE,rotation:0});
  if(Math.abs(viewport.width/SCALE-PW)>2||Math.abs(viewport.height/SCALE-PH)>2)throw Error('PDF页面尺寸已改变，无法可靠定位答题框，请保留原页面尺寸。');
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport,annotationMode:pdfjs.AnnotationMode.ENABLE}).promise;
  let code='';for(let i=0;i<32;i++){const px=ctx.getImageData(Math.round((483+i*2)*SCALE),Math.round(45*SCALE),1,1).data;code+=Math.min(px[0],px[1],px[2])<150?'1':'0'}if(code!==item.code)throw Error('第'+(item.page+1)+'页定位标记不匹配，请勿重排、裁剪或遮盖页面。');
  const selections=[],ratios={};let uncertain=false;
  for(const [letter,[x,y,size]] of Object.entries(item.boxes)){const inset=3,w=Math.round((size-inset*2)*SCALE),data=ctx.getImageData(Math.round((x+inset)*SCALE),Math.round((y+inset)*SCALE),w,w).data;let dark=0,visible=0;for(let i=0;i<data.length;i+=4){const value=Math.min(data[i],data[i+1],data[i+2]);if(value<150)dark++;if(value<235)visible++}const ratio=dark/(w*w);ratios[letter]=ratio;if(ratio>=.04)selections.push(letter);if(visible/(w*w)>=.002&&ratio<.04)uncertain=true;}
  if(q.type==='single'&&selections.length>1)uncertain=true;
  const crop=document.createElement('canvas');crop.width=1000;crop.height=102;crop.getContext('2d').drawImage(canvas,60*SCALE,639*SCALE,500*SCALE,51*SCALE,0,0,1000,102);
  rows.push({id:q.id,selections,uncertain,confirmed:!uncertain,ratios,crop:crop.toDataURL('image/jpeg',.85)});canvas.width=1;canvas.height=1;page.cleanup();onProgress(index+1,m.items.length,'识别答题框');await pause();
 }}finally{await pdf.destroy()}
 return {manifest:m,rows};
}
window.PdfNotebook={makePdf,readManifest,recoverManifest,scanPdf};
})();
