const pages=['dashboard','market','news','portfolio','management','admin'];
export function parseRoute(hash){
 const match=/^#\/company\/([A-Za-z0-9_-]{1,128})$/.exec(hash);
 if(match)return {page:'company',companyId:match[1]};
 const page=hash.replace(/^#\//,'');return {page:pages.includes(page)?page:'dashboard'};
}
export function companyRoute(id){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('잘못된 기업 주소입니다.');return '#/company/'+id;}
