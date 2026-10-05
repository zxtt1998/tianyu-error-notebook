(function(){
'use strict';
const PW=595.28,PH=841.89,SCALE=2,PREFIX='TYNOTEBOOK-PDF-v1|';
const fonts='"PingFang SC","Microsoft YaHei",Arial,sans-serif';
const pause=()=>new Promise(r=>setTimeout(r,0));
function encode(value){const bytes=new TextEncoder().encode(JSON.stringify(value));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function pageCode(id,page){let h=2166136261;for(const c of id+':'+page){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(2).padStart(32,'0')}
function decode(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))))}
async function image(src){const i=new Image();i.src=src;await i.decode();return i}
async function makePdf({questions,subject,solutions=false,onProgress=()=>{}}){
 const doc=await PDFLib.PDFDocument.create(),manifest={version:1,id:crypto.randomUUID(),subject,width:PW,height:PH,items:[],questionIds:questions.map(q=>q.id)},label=subject==='technical'?'安全生产技术':'其他安全专业实务';
 let canvas,ctx,y,current='',pageNumber=0;
 function begin(title){canvas=document.createElement('canvas');canvas.width=Math.ceil(PW*SCALE);canvas.height=Math.ceil(PH*SCALE);ctx=canvas.getContext('2d');ctx.scale(SCALE,SCALE);ctx.fillStyle='#fff';ctx.fillRect(0,0,PW,PH);ctx.fillStyle='#172b43';ctx.font='600 11px '+fonts;ctx.fillText('李天宇 · '+label+' · 手写练习',40,33);ctx.font='10px '+fonts;ctx.fillText(title,40,52);ctx.strokeStyle='#d3dbe5';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(40,61);ctx.lineTo(PW-40,61);ctx.stroke();y=82;current=title}
 async function flush(){if(!canvas)return;const item=manifest.items.find(i=>i.page===doc.getPageCount());if(item){item.code=pageCode(manifest.id,item.page);for(let i=0;i<32;i++){ctx.fillStyle=item.code[i]==='1'?'#000':'#fff';ctx.fillRect(482+i*2,43,2,5)}}ctx.fillStyle='#627186';ctx.font='9px '+fonts;ctx.fillText('练习编号 '+manifest.id.slice(0,8)+' · 第 '+(++pageNumber)+' 页',40,818);const jpg=await doc.embedJpg(canvas.toDataURL('image/jpeg',.94));doc.addPage([PW,PH]).drawImage(jpg,{x:0,y:0,width:PW,height:PH});canvas.width=1;canvas.height=1;canvas=null;await pause()}
 async function room(height,limit=600){if(y+height>limit){await flush();begin(current+'（续页）')}}
 async function text(value,{size=14,line=22,bold=false,indent=0,limit=600}={}){const source=String(value??'').replace(/\\n/g,'\n').replace(/[\u200b-\u200d\ufeff]/g,'');ctx.font=(bold?'600 ':'')+size+'px '+fonts;const max=PW-80-indent;for(const paragraph of source.split('\n')){let row='';const rows=[];for(const char of paragraph){if(row&&ctx.measureText(row+char).width>max){rows.push(row);row=char}else row+=char}rows.push(row);for(const row of rows){await room(line,limit);ctx.font=(bold?'600 ':'')+size+'px '+fonts;ctx.fillStyle='#172b43';ctx.fillText(row,40+indent,y);y+=line}}}
 async function pictures(images=[]){for(const im of images){const i=await image(im.src);let w=Math.min(420,i.width),h=w*i.height/i.width;if(h>210){h=210;w=h*i.width/i.height}await room(h+20);ctx.drawImage(i,40,y-8,w,h);y+=h+16}}
 function writing(top=699,label='我的笔记'){ctx.fillStyle='#637287';ctx.font='11px '+fonts;ctx.fillText(label,40,top);ctx.strokeStyle='#dce3eb';ctx.lineWidth=.5;for(let yy=top+24;yy<800;yy+=24){ctx.beginPath();ctx.moveTo(40,yy);ctx.lineTo(PW-40,yy);ctx.stroke()}}
 for(let index=0;index<questions.length;index++){
  const q=questions[index],title=`第${q.paper}套 · 原题${q.number} · ${q.type==='short'?'案例简答':q.type==='single'?'单选':'多选'}`;
  begin(title);
  if(q.type==='short'){
   await text(q.material,{size:13,line:21,limit:780});await pictures(q.images);await flush();
   for(const part of q.parts){begin(title+' · 第'+part.number+'小问');await text(part.prompt,{bold:true,size:15,line:24,limit:450});writing(Math.max(180,y+25),'我的作答');await flush()}
  }else{
   await text(q.stem,{size:14,line:23});y+=7;await pictures(q.images);
   for(const [letter,value] of Object.entries(q.options)){await text(letter+'. '+value,{size:13,line:22,indent:10});await pictures(q.optionImages?.[letter]);y+=7}
   if(y>600){await flush();begin(title+'（作答页）')}
   ctx.font='11px '+fonts;ctx.fillStyle='#53667d';ctx.fillText('作答区：用深色笔在框内打勾或涂黑，改答案请擦除原标记。',40,625);
   const boxes={};Object.keys(q.options).forEach((letter,i)=>{const x=88+i*91,top=647,size=27;ctx.fillStyle='#172b43';ctx.font='15px '+fonts;ctx.fillText(letter,x-22,top+20);ctx.strokeStyle='#94a3b8';ctx.lineWidth=.8;ctx.strokeRect(x,top,size,size);boxes[letter]=[x,top,size]});
   manifest.items.push({id:q.id,page:doc.getPageCount(),boxes});writing();await flush();
  }
  onProgress(index+1,questions.length,'生成题目');
 }
 if(solutions)for(let index=0;index<questions.length;index++){
  const q=questions[index];begin(`参考答案与解析 · 第${q.paper}套原题${q.number}`);
  if(q.type==='short'){for(const part of q.parts){await text('第'+part.number+'小问：'+part.prompt,{bold:true,size:14,line:23,limit:770});await text(part.referenceAnswer,{size:13,line:22,limit:770});await pictures(part.referenceImages);y+=15}}
  else{await text('正确答案：'+q.answer.join('、'),{bold:true,size:16,line:26,limit:770});await text(q.explanation||'原卷未提供文字解析。',{size:13,line:22,limit:770});await pictures(q.explanationImages)}
  await flush();onProgress(index+1,questions.length,'生成解析');
 }
 manifest.totalPages=doc.getPageCount();doc.setTitle('李天宇 · '+label+' · '+(solutions?'题目与解析':'手写练习'));doc.setAuthor('个人错题本');doc.setSubject('在固定答题框内作答，其他空白可自由手写。');doc.setKeywords([PREFIX+encode(manifest)]);
 return {bytes:await doc.save(),manifest};
}
async function readManifest(bytes){const doc=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false});const keywords=doc.getKeywords()||'';if(!keywords.startsWith(PREFIX))return {manifest:null,pages:doc.getPageCount()};let manifest;try{manifest=decode(keywords.slice(PREFIX.length).replace(/\s/g,''))}catch{throw Error('PDF识别信息损坏，请同时选择原始导出的PDF。')}return {manifest,pages:doc.getPageCount()}}
async function scanPdf(bytes,{originalBytes,bank,onProgress=()=>{}}={}){
 let info=await readManifest(bytes),m=info.manifest;if(!m&&originalBytes)m=(await readManifest(originalBytes)).manifest;
 if(!m)throw Error('请导入本工具导出的作答PDF。若书写软件移除了识别信息，请同时选择原始PDF。');
 const byId=new Map(bank.questions.map(q=>[q.id,q]));
 if(m.version!==1||m.subject!==bank.subject||m.totalPages!==info.pages||!Array.isArray(m.items)||!m.items.length||m.items.length>265||m.width!==PW||m.height!==PH)throw Error('PDF页数或格式不匹配；仅支持本工具导出的选择题PDF，请勿增删或重排页面。');
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
window.PdfNotebook={makePdf,readManifest,scanPdf};
})();
