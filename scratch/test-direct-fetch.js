const https = require('https');

async function testDirectFetch() {
  const url = 'https://www.tradingref.com/api/getPage/20260915/english/' + encodeURIComponent('Business Standard English') + '/' + encodeURIComponent('Delhi');
  console.log('Testing direct fetch to:', url);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.tradingref.com/',
      'Origin': 'https://www.tradingref.com',
    }
  });

  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Body length:', text.length);
  console.log('Body preview:', text.slice(0, 300));
}

testDirectFetch().catch(console.error);
