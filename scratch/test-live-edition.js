const { fetchLiveEditionPages } = require('../src/lib/scraper/live-scraper');

async function test() {
  console.log('Testing fetchLiveEditionPages for 20260915...');
  // We test English -> Business Standard English -> Delhi or Times of India
  const res = await fetchLiveEditionPages('20260915', 'english', 'Business Standard English', 'Delhi');
  console.log('Result:', JSON.stringify(res, null, 2));
}

test().catch(console.error);
