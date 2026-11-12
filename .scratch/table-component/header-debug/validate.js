const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
for(let n=0;n<100&&!document.querySelector('.association-row');n++)await pause(50);
await document.fonts.ready;
if(view==='app'){
  document.querySelector('[aria-label="全部应用"]').click();
  await pause(100);
  document.querySelector('[data-app-path="/System/Applications/Preview.app"]').click();
}else document.querySelector(`[data-view="${view}"]`).click();
await pause(200);
const list=document.querySelector('.association-list');
// Only two protocol fixtures exist; constrain their viewport to exercise scrolling.
if(view==='scheme')list.style.maxHeight='6rem';
list.scrollTop=128;
await pause(200);
const bounds=list.getBoundingClientRect();
if(list.scrollTop===0)throw new Error('The scenario must scroll to cover the clipping bug');
return JSON.stringify({view,top:bounds.top,left:bounds.left,right:bounds.right,scroll:list.scrollTop,clip:getComputedStyle(list).clipPath});
