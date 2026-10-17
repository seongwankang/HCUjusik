import {doc,getDoc,setDoc,serverTimestamp} from 'firebase/firestore';
import {allRows} from './rankings.js';
export function leadershipNames(users,assignments){
 const result=Object.create(null),map=new Map(assignments.map(a=>[a.id,a.companyIds]));
 for(const u of users){if(u.role!=='president'||u.active!==true)continue;const name=String(u.displayName||'').trim().slice(0,80);if(!name)continue;
 for(const cid of new Set(map.get(u.id)||[])){if(!/^[A-Za-z0-9_-]{1,128}$/.test(cid))continue;(result[cid]??=[]).push(name);}}
 for(const names of Object.values(result))names.sort((a,b)=>a.localeCompare(b,'ko'));return result;
}
export async function publishLeadership(db){const users=await allRows(db,'users'),presidents=users.filter(u=>u.role==='president'&&u.active===true);const assignments=await Promise.all(presidents.map(async u=>{const s=await getDoc(doc(db,'assignments',u.id));return {id:u.id,...s.data()};}));const companies=leadershipNames(users,assignments);await setDoc(doc(db,'companyLeadership','main'),{companies,updatedAt:serverTimestamp()});}
