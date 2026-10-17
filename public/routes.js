const pages=['dashboard','market','news','portfolio','management','admin','rankings'];
export function parseRoute(hash){
 const article=/^#\/(news|event)\/([A-Za-z0-9_-]{1,128})$/.exec(hash);if(article)return {page:'article',articleId:article[2],articleKind:article[1]};
 const match=/^#\/company\/([A-Za-z0-9_-]{1,128})$/.exec(hash);
 if(match)return {page:'company',companyId:match[1]};
 const page=hash.replace(/^#\//,'');return {page:pages.includes(page)?page:'dashboard'};
}
export function companyRoute(id){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('잘못된 기업 주소입니다.');return '#/company/'+id;}

export function articleRoute(id,kind='news'){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!['news','event'].includes(kind))throw new Error('잘못된 뉴스 주소입니다.');return '#/'+kind+'/'+id;}
