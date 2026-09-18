const https = require('https');

https.get('https://www.tradingref.com/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  console.log('Status:', res.statusCode, 'Location:', res.headers.location);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const scripts = [...data.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m => m[1]);
    console.log('Scripts:', scripts);
    console.log('HTML length:', data.length);
    console.log('HTML preview:', data.slice(0, 500));
  });
}).on('error', console.error);
