// Offline generator only. Prints fictional data; never connects or writes to a database.
const companies = Array.from({length: 21}, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    path: `companies/club${n}`,
    data: {ticker: `CLUB${n}`, name: `동아리 ${n}`, category: '미정',
      description: '동아리 정보 등록 대기', referencePrice: 10000,
      issuedShares: 1000, companyCash: 0, dailyRevenue: 0, status: 'draft'}
  };
});
console.log(JSON.stringify({companies}, null, 2));
