#!/usr/bin/env node
// 초기 관리자에게만 사용하는 로컬 계정 생성 도구. 실제 학생정보를 소스코드에 커밋하지 마세요.
import {randomUUID, randomBytes, pbkdf2Sync} from 'node:crypto';
import {writeFileSync} from 'node:fs';

const [username, displayName, role = 'student'] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username || '') || !displayName || displayName.length > 40 || !['student','president','admin'].includes(role)) {
  console.error('사용법: node scripts/create-user.mjs <아이디> <표시이름> [student|president|admin]');
  process.exit(1);
}

function readPassword() {
  return new Promise((resolve,reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) return reject(new Error('암호 입력을 위한 터미널(TTY)이 필요합니다.'));
    let password = '';
    process.stdout.write('초기 비밀번호(화면에 표시되지 않음): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data',onData);
          process.stdout.write('\n'); return resolve(password);
        }
        if (ch === '\u0003') {process.stdin.setRawMode(false); process.stdin.pause();process.exit(130);}
        if (ch === '\u007f' || ch === '\b') password = password.slice(0,-1);
        else password += ch;
      }
    };
    process.stdin.on('data',onData);
  });
}
const password = await readPassword();
if (password.length < 8 || password.length > 128) {console.error('비밀번호는 8~128자로 설정하세요.');process.exit(1);}
const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(password, Buffer.from(salt,'hex'),180000,32,'sha256').toString('hex');
const sqlString = s => `'${String(s).replaceAll("'","''")}'`;
const sql = `INSERT INTO users(id,username,display_name,role,password_salt,password_hash,cash_balance) VALUES (${[randomUUID(),username,displayName,role,salt,hash].map(sqlString).join(',')},1000000);\n`;
const path = `.generated-user-${username}.sql`;
writeFileSync(path,sql,{flag:'wx',mode:0o600});
console.log(`생성됨: ${path} (Git에 업로드하지 마세요)`);
