export const NEWS_CATEGORIES=['공지','기업 뉴스','시장 동향','이벤트'];
export const newsCategory=n=>NEWS_CATEGORIES.includes(n.category)?n.category:n.companyName?'기업 뉴스':'공지';
