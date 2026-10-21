import {clearImmutableRows,setHistoryOwner} from './immutable-reads.js';
import {createViewReads} from './live-reads.js';
import {subscribeQuotes} from './quotes.js';
import {getFirestore} from 'firebase/firestore';
import {createClientApi} from './data.js';
import {initializeApp} from 'firebase/app';
import {passwordChanger} from './password.js';
import {
  getAuth, setPersistence, browserSessionPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, reload, signOut, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from 'firebase/auth';

let auth;
let ready;
let generation = 0;
let api;
let viewReads;
export const sessionVersion = () => generation;
async function init() {
  const response = await fetch(new URL('firebase.config.json',document.baseURI),{cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  auth = getAuth(initializeApp(data));
  auth.languageCode = 'ko';
  viewReads=createViewReads(getFirestore(auth.app),path=>window.dispatchEvent(new CustomEvent('view-data-changed',{detail:{path}})));
  api=createClientApi({db:getFirestore(auth.app),viewReads,getUser:async()=>auth.currentUser});
  // Keep reloads signed in within this tab; do not retain a permanent login.
  await setPersistence(auth, browserSessionPersistence);
  // Do not query private data until Firebase restores the saved session.
  await auth.authStateReady();
  await setHistoryOwner(getFirestore(auth.app),auth.currentUser?.uid||null);
  return auth;
}
function ensure() {
  return ready ||= init().catch(error => {ready = undefined; throw error;});
}
export async function idToken() {
  await ensure();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
export async function login(email, password) {
  await ensure();
  await signInWithEmailAndPassword(auth, email, password);
  viewReads.clear();
  await setHistoryOwner(getFirestore(auth.app),auth.currentUser.uid);
  generation++;
}
export async function signup(email, password, displayName='') {
  if(!/^[^\s@]+@hcu\.hs\.kr$/i.test(email.trim()))throw new Error('학교 이메일(@hcu.hs.kr)로만 가입할 수 있습니다.');
  await ensure();
  await createUserWithEmailAndPassword(auth, email, password);
  viewReads.clear();
  await setHistoryOwner(getFirestore(auth.app),auth.currentUser.uid);
  generation++;
  // Keep the pending student's name with their Auth account across tabs/devices.
  if(displayName.trim())await updateProfile(auth.currentUser,{displayName:displayName.trim().slice(0,80)});
}
export async function verificationStatus(refresh=false) {
  await ensure();
  if(!auth.currentUser)return null;
  if(refresh){await reload(auth.currentUser);await auth.currentUser.getIdToken(true);}
  return {email:auth.currentUser.email,verified:auth.currentUser.emailVerified,displayName:auth.currentUser.displayName||''};
}
export async function sendVerification() {
  await ensure();
  if(!auth.currentUser)throw new Error('로그인이 필요합니다.');
  await sendEmailVerification(auth.currentUser);
}
export async function logout() {
  generation++;
  await ensure();
  await signOut(auth);
  viewReads.clear();
  await clearImmutableRows(getFirestore(auth.app));
}

export async function changePassword(current,next,confirmation){
 await ensure();
 await passwordChanger({getUser:()=>auth.currentUser,credential:EmailAuthProvider.credential,
  reauthenticate:reauthenticateWithCredential,update:updatePassword})(current,next,confirmation);
}

export async function dataRequest(path,options){
 await ensure();try{const result=await api(path,options);
  if(path==='/api/rankings-auto'){
   if(result.updated)await viewReads.refresh(['leaderboards','investorSnapshots']).catch(()=>{});
   return result;
  }
  if(options?.method==='POST'){
   let b={};try{b=JSON.parse(options.body||'{}');}catch{}
   // Transactions still read authoritative documents. Confirm only affected views.
   const uid=auth.currentUser?.uid,cid=b.companyId;
   const paths=['users/'+uid,'sparkAccounts/'+uid,...(cid?['sparkBooks/'+cid,'companyOperations/'+cid,'companySpies/'+cid,'companyChoices/'+cid]:[])];
   if(path==='/api/economy-rate')paths.push('news','dividendForecasts');
   if(path.includes('/admin/')||/event-|rankings-publish|economy-config|spy-policy/.test(path))paths.push('*');
   await viewReads.refresh(paths).catch(()=>{});
  }
  return result;
 }catch(error){
  if(!error.code)error.status=400;
  else if(['permission-denied','invalid-argument','not-found','already-exists'].includes(error.code))error.status=error.code==='permission-denied'?403:400;
  throw error;
 }
}

export async function watchCompanyQuotes(companies,update){await ensure();if(!auth.currentUser)return ()=>{};return subscribeQuotes(getFirestore(auth.app),companies,update,viewReads);}
export async function refreshViewData(paths=['*']){await ensure();await viewReads.refresh(paths);}
