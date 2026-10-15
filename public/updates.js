export function installUpdateNotice(buildId){
 if(buildId==='dev')return;
 const notice=document.querySelector('#app-update'),button=document.querySelector('#app-update-reload');
 async function check(){try{const r=await fetch(new URL('version.json',document.baseURI),{cache:'no-store'});if(r.ok&&(await r.json()).buildId!==buildId)notice.hidden=false;}catch{}}
 button.addEventListener('click',()=>location.reload());window.addEventListener('focus',check);setInterval(check,60000);check();
 const label=document.querySelector('#app-version');if(label)label.textContent='BUILD '+buildId.slice(0,10);
}
