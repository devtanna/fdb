const puppeteer = require('puppeteer');
const $ = require('cheerio');

const settings = require('./settings');
const utils = require('./utils');
const parse = require('./parse');


const getLocations = async page => {
  try {
    await page.goto('https://www.talabat.com/uae/sitemap');
    const html = await page.content();
    const links = $("h4:contains('Dubai')", html)
      .next('.row')
      .find('a')
      .map((i, link) => {
        return {
          locationName: $(link).text(),
          url: $(link).prop('href'),
        };
      });
    return links;
  } catch (error) {
    console.log(error);
  }
};

async function scrapeInfiniteScrollItems(page, pageCount, scrollDelay = 1000) {
  let items = [];
  let itemsMap = {};
  let pageNum = 0;
  try {
    let previousHeight;
    while (pageNum < pageCount) {
      const html = await page.content();
      // we get the location from the url
      const location = page.url().split('/')[6];
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('span'))
          .filter(element => element.textContent === 'Offers')[0]
          .click();
      });

      $('.rest-link', html).each(function() {
        let $ratingImgSrc = $('.rating-img > img', this).attr('src');
        let starRating = $ratingImgSrc.match(
          new RegExp('rating-' + '(.*)' + '.svg')
        )[1];
        let cuisine = [];
        $('.cuisShow .ng-binding', this).each(function() {
          cuisine.push($(this).text());
        });
        let title = clean_talabat_title(
          $('.media-heading', this)
            .text()
            .trim()
            .replace(/['"]+/g, '')
        );
        let rest_slug = utils.slugify(
          clean_talabat_title(
            $('.media-heading', this)
              .text()
              .trim()
              .replace(/['"]+/g, '')
          )
        );
        let result = {
          title: clean_talabat_title(
            $('.media-heading', this)
              .text()
              .trim()
              .replace(/['"]+/g, '')
          ),
          branch: clean_talabat_branch(
            $('.media-heading', this)
              .text()
              .trim()
              .replace(/['"]+/g, '')
          ),
          slug: rest_slug,
          href: 'https://www.talabat.com' + $(this).attr('href'),
          image: $('.valign-helper', this)
            .next()
            .prop('lazy-img')
            .split('?')
            .shift(),
          location: location.trim(),
          rating: starRating,
          cuisine: clean_talabat_cuisine(cuisine.join('')),
          offer: $("div[ng-if='rest.offersnippet']", this)
            .text()
            .trim(),
          deliveryTime: $(
            'span[ng-if="!showDeliveryRange || rest.dtim >= 120"]',
            this
          )
            .text()
            .trim(),
          minimumOrder: $('span:contains("Min:")', this)
            .next()
            .text()
            .trim(),
          deliveryCharge: $('span[ng-switch-when="0"]', this)
            .text()
            .trim(),
          cost_for_two: '', // no info on talabat
          votes: clean_talabat_votes(
            $('.rating-num', this)
              .text()
              .trim()
          ),
          source: `${scraper_name}`,
          address: '', // no info on talabat
          type: 'restaurant',
        };

        // if no offer, then skip
        if (result.offer.length > 0) {
          let { scoreLevel, scoreValue } = utils.calculateScore(result);
          result['scoreLevel'] = scoreLevel;
          result['scoreValue'] = scoreValue;
          var index = items.indexOf(result); // dont want to push duplicates
          if (index === -1) {
            items.push(result); // write to db
          }
        }
      });
      pageNum++;
      // scroll to next page
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForFunction(
        `document.body.scrollHeight > ${previousHeight}`,
        { timeout: scrollDelay }
      );
      await page.waitFor(scrollDelay);
    }
  } catch (e) {
    console.log('Error during infinte page scrape: ' + e);
  }
  console.log('Number of items scraped: ' + items.length);
  return items;
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function scrape_talabat(){
  var scraper_name = 'talabat';
  var db;
  var dbClient;
  // Initialize connection once at the top of the scraper
  var MongoClient = require('mongodb').MongoClient;

  if (settings.ENABLE_TALABAT) {
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

  if (!settings.ENABLE_TALABAT) {
    console.log('Talabat scraper is DISABLED. EXITING.');
    process.exit();
  }

  browser = await puppeteer.launch({
    headless: settings.PUPPETEER_BROWSER_ISHEADLESS,
    args: settings.PUPPETEER_BROWSER_ARGS,
  });

  const page = await browser.newPage();
  await page.setViewport(settings.PUPPETEER_VIEWPORT);

  var urls = await getLocations(page);
  page.close();
  if (urls != null) {
    if (settings.SCRAPER_TEST_MODE) {
      urls = urls.slice(0, 2);
    }

    console.log('Number of locations: ' + urls.length);
    var count = urls.length - 1;
    for (let i = 0; i < urls.length; i++) {
      console.log('Locations processed: ' + i + '/' + urls.length);
      let url = urls[i];

      if (i > 0 && i % settings.SCRAPER_NUMBER_OF_MULTI_TABS == 0) {
        await sleep(settings.SCRAPER_SLEEP_BETWEEN_TAB_BATCH);
      }

      browser.newPage().then(page => {
        page.setViewport(settings.PUPPETEER_VIEWPORT);

        try {
          page
            .goto(
              `https://www.talabat.com/${url.url}`,
              settings.PUPPETEER_GOTO_PAGE_ARGS
            )
            .then(() => {
              console.log('Scraping location: ' + url.url);

              var maxPage = settings.SCRAPER_MAX_PAGE('talabat');

              scrapeInfiniteScrollItems(page, maxPage).then(res => {
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
                      console.log('Talabat Scrape Done!');
                    } else {
                      page.close();
                    }
                  });
              });
            });
        } catch (error) {
          console.log('', error);
          count -= 1;
          if (count < 0) {
            console.log('Closing browser');
            // Close the browser.
            browser.close();
            console.log('Closing client');
            // close the dbclient
            dbClient.close();
            console.log('Talabat Scrape Done!');
          } else {
            page.close();
          }
        }
      });
    }
  }

}

function clean_talabat_title(title) {
  return title
    .split(',')[0]
    .replace('Restaurant', '')
    .trim();
}

function clean_talabat_cuisine(input) {
  return input.replace(/,\s*$/, '');
}

function clean_talabat_votes(input) {
  if (
    input != null &&
    input.match(/\d+/) != null &&
    input.match(/\d+/).length > 0
  ) {
    return input.match(/\d+/)[0];
  } else {
    return '';
  }
}

function clean_talabat_rating(input) {
  if (
    input != null &&
    input.match(/\d+/) != null &&
    input.match(/\d+/).length > 0
  ) {
    return input.match(/\d+/)[0];
  } else {
    return '';
  }
}

function clean_talabat_branch(title) {
  var branch = title.split(',')[1];
  if (branch != undefined && branch.length > 0) {
    return branch.trim();
  }
  return '';
}

(async () => {
  scrape_talabat();
})();

module.exports = {
  scrape_talabat
};