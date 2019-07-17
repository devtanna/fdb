const atlasConnection =
  'mongodb+srv://devtanna:K4eh5Ds2MrDkAk5I@foodable-cluster0-zyyjg.gcp.mongodb.net';
const mongoSettings = {
  DB: atlasConnection + '/foodabledb?retryWrites=true&w=majority',
  DB_CONNECT_URL: atlasConnection,
  DB_NAME: 'foodabledb',
  DB_FULL_URL: atlasConnection + '/foodlabdb?retryWrites=true&w=majority',
  MONGO_COLLECTION_NAME: 'collection_azure_func',
};


const puppeteerSettings = {
  PUPPETEER_BROWSER_ISHEADLESS: true,
  PUPPETEER_BROWSER_ARGS: [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-zygote',
    '--no-first-run',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36',
  ],
  PUPPETEER_VIEWPORT: { width: 1400, height: 800 },
  PUPPETEER_GOTO_PAGE_ARGS: {
    timeout: 35000, // 15seconds
    waitUntil: ['load'],
  },
};

var scraperSettings = {
  // TEST MODE TOGGLE - this runs only a subset of results
  SCRAPER_TEST_MODE: false,
  // MAX PAGES TO SCRAPE
  SCRAPER_MAX_PAGE: function(scraperName) {
    if (this.SCRAPER_TEST_MODE) return 5;
    if (scraperName == 'zomato') return 25;
    if (scraperName == 'talabat') return 5;
    if (scraperName == 'carriage') return 25;
    if (scraperName == 'deliveroo') return 5;
    if (scraperName == 'ubereats') return 5;
    return 5;
  },
  // Max number of multi tabs to open at a time
  get SCRAPER_NUMBER_OF_MULTI_TABS() {
    return this.SCRAPER_TEST_MODE ? 1 : 3;
  },

  SCRAPER_SLEEP_BETWEEN_TAB_BATCH: 8000,

  // SCRAPER INDIVIDUAL TOGGLE
  ENABLE_TALABAT: true,
  ENABLE_UBEREATS: true,
  ENABLE_ZOMATO: true,
  ENABLE_DELIVEROO: true,
  ENABLE_CARRIAGE: true,
};

var devSettings = Object.assign(
  {},
  puppeteerSettings,
  mongoSettings,
  scraperSettings
);


module.exports = devSettings;
