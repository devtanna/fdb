const settings = require('./settings');
const puppeteer = require('puppeteer');
const $ = require('cheerio');

const utils = require('./utils');
const parse = require('./parse');

const scrapePage = async (url, page, scraper_name) => {
  try {
    await page.goto(
      `https://deliveroo.ae${url.url}?offer=all+offers`,
      settings.PUPPETEER_GOTO_PAGE_ARGS
    );

    var maxPage = settings.SCRAPER_MAX_PAGE('deliveroo');
    for (let i = 0; i < maxPage; i++) {
      await page.evaluate('window.scrollBy(0, window.innerHeight);');
      await page.waitFor(1000);
    }

    const html = await page.content();
    let items = [];
    let offersCount = $('li[class*="HomeFeedGrid"]', html).length;

    console.log(`Number of available offers: ${offersCount}`);

    $('li[class*="HomeFeedGrid"]', html).each(function() {
      let img;
      try {
        img = $(this)
          .children('div')
          .children('div')
          .children('a')
          .children('span')
          .children('div')
          .css('background-image');
      } catch (err) {
        img = '';
      }

      let cuisine = [];
      let rating = null;
      let votes = null;
      $('li[class*="HomeFeedUICard"]', this)
        .eq(1)
        .children('span span')
        .each(function() {
          let el = $(this)
            .text()
            .trim();

          if (el === '' || el === '·') return;

          if (el.match(/\((\d+(.\d+)*)[+]*\)/g)) {
            votes = el.match(/(\d+(.\d+)*)/g);
          } else if (el.match(/(\d+(.\d+)*)/g)) {
            rating = el.match(/(\d+(.\d+)*)/g)[0];
          } else if (el !== '' && el !== '·') {
            cuisine.push(el);
          }
        });

      let title = $('li[class*="HomeFeedUICard"] span p', this)
        .eq(0)
        .text()
        .trim();

      let offer = $('li[class*="HomeFeedUICard"]', this)
        .eq(2)
        .children('span')
        .eq(2)
        .children('span')
        .text()
        .trim();

      let result = {
        title,
        slug: utils.slugify(
          $('li[class*="HomeFeedUICard"] span p', this)
            .eq(0)
            .text()
            .trim()
        ),
        href: clean_deliveroo_href($('a', this).prop('href')),
        image: cleanImg(img),
        location: url.locationName,
        address: '',
        cuisine: cuisine.join(', '),
        offer,
        rating,
        votes,
        source: `${scraper_name}`,
        cost_for_two: '',
        type: 'restaurant',
      };

      // if no offer, then skip
      if (result.offer.length > 0) {
        let { scoreLevel, scoreValue } = utils.calculateScore(result);
        result['scoreLevel'] = scoreLevel;
        result['scoreValue'] = scoreValue;

        let obj = items.find(o => o.slug === result.slug);
        if (obj == undefined && scoreLevel !== -1) {
          // dont want to push duplicates
          items.push(result);
        }
      }
    });

    return items;
  } catch (error) {
    console.log('Error in data extract: ' + error);
  }
};

const getLocations = async (page) => {
  try {
    await page.goto(
      'https://deliveroo.ae/sitemap',
      settings.PUPPETEER_GOTO_PAGE_ARGS
    );
    const html = await page.content();
    const links = $("h3:contains('Dubai')", html)
      .next('.sitemap--zones')
      .find('> li')
      .find('> a')
      .map((i, link) => {
        return {
          locationName: $(link).text(),
          url: $(link).prop('href'),
        };
      });

    return links;
  } catch (error) {
    console.log('Error in sitemap fetch: ' + error);
  }
};


async function scrape_deliveroo(){
  var scraper_name = 'deliveroo';
  var db;
  var dbClient;
  if (settings.ENABLE_DELIVEROO) {
    // Initialize connection once at the top of the scraper
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
  } else {
    console.log('Deliveroo scraper is DISABLED. EXITING.');
    process.exit();
  }

  /////////////////////////////////

  let browser;
  let page;

  browser = await puppeteer.launch({
    headless: settings.PUPPETEER_BROWSER_ISHEADLESS,
    args: settings.PUPPETEER_BROWSER_ARGS,
  });
  page = await browser.newPage();
  await page.setViewport(settings.PUPPETEER_VIEWPORT);

  var links = await getLocations(page);
  if (links != null) {
    if (settings.SCRAPER_TEST_MODE) {
      links = links.slice(0, 2);
    }

    console.log('Number of locations received: ' + links.length);
    for (let i = 0; i < links.length; i++) {
      console.log('On scrape ' + i + ' / ' + links.length);

      try {
        console.log('Scraping: ' + links[i].url);

        let res = await scrapePage(links[i], page, scraper_name);

        if (res != null) {
          var flatResults = [].concat.apply([], res);

          // this is an async call
          await parse.process_results(
            flatResults,
            db,
            dbClient,
            scraper_name,
            (batch = true)
          );
          console.log('Scraped deliveroo. Results count: ' + res.length);
        }
      } catch (error) {
        console.log('Error in overall fetch: ' + error);
      }
    }
  }

  await browser.close();
  // close the dbclient
  await dbClient.close();
  console.log('Deliveroo Scrape Done!', 'Everything closed');
}

function clean_deliveroo_href(input) {
  return input.replace(/time=[0-9]{4}$/, 'time=ASAP');
}

function cleanImg(img) {
  let imgSrc = img;

  if (imgSrc) {
    if (imgSrc.includes('url("')) {
      imgSrc = imgSrc.replace('url("', '');
      imgSrc = imgSrc.slice(0, -2);
    } else if (imgSrc.includes('url(')) {
      imgSrc = imgSrc.replace('url(', '');
      imgSrc = imgSrc.slice(0, -1);
    }
  }

  return imgSrc;
}

(async () => {
  scrape_deliveroo();
})();

module.exports = {
  scrape_deliveroo
};