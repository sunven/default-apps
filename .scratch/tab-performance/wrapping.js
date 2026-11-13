(async()=>{
 const errors=[];
 const onError=event=>errors.push(event.message);
 window.addEventListener('error',onError);
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 for(let i=0;i<100&&!document.querySelector('[data-association-id]');i++)await pause(50);
 await document.fonts.ready;
 Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent==='文件类型').click();
 await pause(150);
 const list=document.querySelector('.association-list');
 const first=list.querySelector('.association-row');
 const before=first.getBoundingClientRect().height;
 first.querySelector('strong').textContent='需要保留完整名称的多行文件类型名称'.repeat(12);
 await pause(200);
 const after=first.getBoundingClientRect().height;
 if(after<=before)throw Error('The scenario must produce a variable-height row');
 for(const offset of [0,100,3000,18000,0]){
  list.scrollTop=offset;await pause(120);
  const bounds=list.getBoundingClientRect();
  const rects=Array.from(list.querySelectorAll('.association-row')).map(r=>r.getBoundingClientRect()).filter(r=>r.bottom>bounds.top+50&&r.top<bounds.bottom);
  if(!rects.length)throw Error('Viewport must not be blank');
  for(let i=1;i<rects.length;i++)if(Math.abs(rects[i].top-rects[i-1].bottom)>2)throw Error('Visible rows must stay contiguous');
 }
 window.removeEventListener('error',onError);
 if(errors.length)throw Error(errors.join('; '));
 return {pass:true,before,after};
})()
