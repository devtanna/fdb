const puppeteer = require('puppeteer');
const $ = require('cheerio');
const ObjectsToCsv = require('objects-to-csv');
var locations = require('./carriage_locations.json');
const settings = require('./settings');
const utils = require('./utils');
const parse = require('./parse');


async function scrapeInfiniteScrollItems(
  page,
  pageCount,
  scrollDelay = 1000,
  location,
  scraper_name
) {
  let items = [];
  let pageNum = 0;
  try {
    let previousHeight;

    await page.evaluate('$("#specialoffers").click()');
    await page.waitFor(4000);

    while (pageNum < pageCount) {
      console.log('Scraping page number: ' + pageNum);

      const html = await page.content();

      const listingsWithOffers = $('.restaurant-item', html);

      console.log('Got number of offers: ' + listingsWithOffers.length);

      try {
        listingsWithOffers.each(function() {
          let result = {
            title: $('.rest-name-slogan h3', this)
              .text()
              .trim(),
            type: 'restaurant',
            source: `${scraper_name}`,
            href:
              'https://www.trycarriage.com/en/ae/' +
              $('a:first-child', this).prop('href'),
            slug: utils.slugify(
              $('.rest-name-slogan h3', this)
                .text()
                .trim()
            ),
            image: $('.rest-cover', this)
              .css('background-image')
              .split(/"/)[1],
            location: utils.slugify(location.name),
            rating: null,
            cuisine: $('.rest-name-slogan p', this)
              .text()
              .trim(),
            offer: 'Special Offer',
            deliveryTime: $('.del-time em', this)
              .text()
              .trim(),
            minimumOrder: null,
            deliveryCharge: null,
            cost_for_two: null,
            votes: null,
            address: location.name,
          };

          if (result.offer.length > 0) {
            let { scoreLevel, scoreValue } = utils.calculateScore(result);
            result['scoreLevel'] = scoreLevel;
            result['scoreValue'] = scoreValue;

            var index = items.indexOf(result); // dont want to push duplicates
            if (index === -1) {
              items.push(result);
            }
          }
        });
      } catch (error) {
        console.log(error);
      }

      // scroll to next page
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForFunction(
        `document.body.scrollHeight > ${previousHeight}`,
        { timeout: scrollDelay }
      );
      await page.waitFor(scrollDelay);

      if (items.length === listingsWithOffers.length) break;

      pageNum++;
    }
  } catch (e) {
    console.log(e);
  }
  console.log('number of items scraped: ' + items.length);
  return items;
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}


async function scrape_carriage() {
  // ########## START DB STUFF ####################
  var scraper_name = 'carriage';
  var db;
  var dbClient;
  // Initialize connection once at the top of the scraper
  if (settings.ENABLE_CARRIAGE) {
    var MongoClient = require('mongodb').MongoClient;
    MongoClient.connect(
      settings.DB_CONNECT_URL,
      { useNewUrlParser: true },
      function(err, client) {
        if (err) throw err;
        db = client.db(settings.DB_NAME);
        dbClient = client;
        console.log('... Connected to mongo! ... at: ' + settings.DB_CONNECT_URL);
      }
    );
  }
  // ########## END DB STUFF ####################

  if (!settings.ENABLE_CARRIAGE) {
    console.log('Carriage scraper is DISABLED. EXITING.');
    process.exit();
  }

  // Set up browser and page.
  const browser = await puppeteer.launch({
    headless: settings.PUPPETEER_BROWSER_ISHEADLESS,
    args: settings.PUPPETEER_BROWSER_ARGS,
  });
  const page = await browser.newPage();
  page.setViewport(settings.PUPPETEER_VIEWPORT);

  if (settings.SCRAPER_TEST_MODE) {
    locations = locations.slice(0, 2);
  }

  var count = locations.length - 1;
  for (let i = 0; i < locations.length; i++) {
    console.log('On location ' + i + ' / ' + count);
    try {
      if (i > 0 && i % settings.SCRAPER_NUMBER_OF_MULTI_TABS == 0) {
        await sleep(settings.SCRAPER_SLEEP_BETWEEN_TAB_BATCH);
      }

      browser.newPage().then(page => {
        page.setViewport(settings.PUPPETEER_VIEWPORT);
        page
          .goto(
            `https://www.trycarriage.com/en/ae/restaurants?area_id=${
              locations[i].id
            }`,
            { waitUntil: 'load' }
          )
          .then(() => {
            var maxPage = settings.SCRAPER_MAX_PAGE('talabat');

            console.log('Scraping location: ' + locations[i].name);

            scrapeInfiniteScrollItems(page, maxPage, 1000, locations[i],scraper_name).then(
              res => {
                var flatResults = [].concat.apply([], res);
                parse
                  .process_results(
                    flatResults,
                    db,
                    dbClient,
                    scraper_name,
                    (batch = true)
                  )
                  .then(() => {
                    count -= 1;
                    if (count < 0) {
                      console.log('Closing browser');
                      // Close the browser.
                      browser.close();
                      console.log('Closing client');
                      // close the dbclient
                      dbClient.close();
                      console.log('Carriage Scrape Done!');
                    } else {
                      page.close();
                    }
                  });
              }
            );
          });
      });
    } catch (error) {
      console.log('', error);
    }
  }



}

(async () => {
  scrape_carriage();
})();


module.exports = {
  scrape_carriage
};