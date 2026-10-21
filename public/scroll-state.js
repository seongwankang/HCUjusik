// Capture at paint time, after the network wait, so a scroll during loading wins.
const markup=new WeakMap();
function path(root,node){
 const parts=[];
 while(node!==root){const parent=node.parentElement;if(!parent)return null;parts.unshift(Array.prototype.indexOf.call(parent.children,node));node=parent;}
 return parts;
}
export function captureScroll(root){
 return [root,...root.querySelectorAll('*')].filter(node=>node.scrollTop||node.scrollLeft).map(node=>({node,id:node.id,path:path(root,node),top:node.scrollTop,left:node.scrollLeft}));
}
export function restoreScroll(root,saved){
 for(const item of saved){
  let node=item.node;
  if(node!==root&&!root.contains(node)){
   node=item.id?[...root.querySelectorAll('[id]')].find(n=>n.id===item.id):null;
   if(!node&&item.path)node=item.path.reduce((parent,index)=>parent?.children[index],root);
  }
  if(node){node.scrollTop=item.top;node.scrollLeft=item.left;}
 }
}
export function setHTMLKeepingScroll(root,html,{revision}={}){
 const previous=markup.get(root);
 if(previous?.html===html&&previous.revision===revision&&previous.nodes.length===root.childNodes.length&&previous.nodes.every((node,index)=>node===root.childNodes[index]))return;
 const saved=captureScroll(root);root.innerHTML=html;markup.set(root,{html,revision,nodes:[...root.childNodes]});restoreScroll(root,saved);
}
