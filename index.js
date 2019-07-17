const deliverooScraper = require('./deliveroo');
const talabatScraper = require('./talabat');
const zomatoScraper = require('./zomato');
const carriageScraper = require('./carriage');
const dbclean = require('./dbClean');
const reindex = require('./reindex');

async function startDeliveroo() {
  console.log('Deliveroo scraper triggered.');
  deliverooScraper.scrape_deliveroo();
}

async function startCarriage() {
  console.log('Carriage scraper triggered.');
  carriageScraper.scrape_carriage();
}

async function startTalabat() {
  console.log('Talabat scraper triggered.');
  talabatScraper.scrape_talabat();
}

async function startZomato() {
  console.log('Zomato scraper triggered.');
  zomatoScraper.scrape_zomato();
}

async function startDbClean() {
  console.log('startDbClean triggered.');
  dbclean.cleanDB();
}

async function startReIndex() {
  console.log('reindex triggered.');
  reindex.reindex();
}

(async () => {
  await startDbClean();
  await startDeliveroo();
  await startReIndex();
})();
// startTalabat();
// startCarriage();
// startZomato();
// startDeliveroo();
// startReIndex();