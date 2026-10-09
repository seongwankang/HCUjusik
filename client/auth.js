import {initializeApp} from 'firebase/app';
import {
  getAuth, setPersistence, inMemoryPersistence,
  signInWithEmailAndPassword, signOut
} from 'firebase/auth';

let auth;
let ready;
let generation = 0;
export const sessionVersion = () => generation;
async function init() {
  const response = await fetch('/api/config');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  auth = getAuth(initializeApp(data.firebase));
  // Shared school computers: no token persistence in browser storage.
  await setPersistence(auth, inMemoryPersistence);
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
  generation++;
}
export async function logout() {
  generation++;
  await ensure();
  await signOut(auth);
}
