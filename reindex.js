const puppeteer = require('puppeteer');
const $ = require('cheerio');

const settings = require('./settings');
const utils = require('./utils');
const parse = require('./parse');
var ObjectID = require('mongodb').ObjectID;

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function reindex_setup() {
  var db;
  var dbClient;
  // Initialize connection once at the top of the scraper
  var MongoClient = require('mongodb').MongoClient;
  await MongoClient.connect(
    settings.DB_CONNECT_URL,
    { useNewUrlParser: true },
    function(err, client) {
      if (err) throw err;
      db = client.db(settings.DB_NAME);
      dbClient = client;
      console.log('... Connected to mongo! ... at: ' + settings.DB_CONNECT_URL);

      var currentDate = new Date();
      var todayDateStr =
        currentDate.getDate() +
        '_' +
        (currentDate.getMonth() + 1) +
        '_' +
        currentDate.getFullYear();

      // Lets start reindexing!!
      reindex(db, dbClient, todayDateStr);
    }
  );
}

async function reindex(db, dbClient, todayDateStr) {
  var collectionName = settings.MONGO_COLLECTION_NAME;
  var ops = [];
  var BATCH_SIZE = 100;

  // find all new restaurants
  var restaurants = await db
    .collection(collectionName)
    .find({
      type: 'restaurant',
      indexed: {
        $eq: 0,
      },
    })
    .toArray();
  console.log('Found entities to index: ' + restaurants.length);
  if (restaurants.length > 0) {
    for (var i = 0; i < restaurants.length; i++) {
      // ==== START BATCH OPERATION
      // perform batch operations
      if (ops.length > BATCH_SIZE) {
        console.log(
          'Starting BATCH Number of operations => ' +
            ops.length +
            '. Progress: ' +
            i +
            ' / ' +
            restaurants.length
        );
        await db
          .collection(collectionName)
          .bulkWrite(ops, { ordered: false })
          .then(
            function(result) {
              console.log(
                'Mongo BATCH Write Operation Complete: ' +
                  ops.length +
                  ' operations.'
              );
            },
            function(err) {
              console.log('Mongo BATCH Write: Promise: error ' + err);
            }
          )
          .catch(e => console.log(e))
          .then(() => (ops = []));
      }
      // ==== END BATCH OPERATION

      // step 1) setup current restaurant
      var current_res = restaurants[i],
        current_res_slug = restaurants[i]['slug'],
        current_res_id = current_res['_id'],
        current_source = restaurants[i]['source'],
        current_location_slug = restaurants[i]['locationSlug'],
        cuisineTags = current_res['cuisine'].split(',').map(s => s.trim());
      delete current_res['_id'];

      if (cuisineTags.length) {
        ops.push({
          updateOne: {
            filter: {
              type: 'cuisine',
            },
            update: {
              $addToSet: {
                tags: { $each: cuisineTags },
              },
            },
            upsert: true,
            new: true,
          },
        });
      }
      // step 2) find all offers in the same location
      var allOffers = await db
        .collection(collectionName)
        .find({
          type: 'offers',
          locationSlug: current_location_slug,
        })
        .toArray();
      console.log('Found offers in restaurant location: ' + allOffers.length);
      var foundMatch = false;
      if (allOffers.length > 0) {
        // setup best init
        for (var j = 0; j < allOffers.length; j++) {
          if (allOffers[j] == undefined) {
            continue;
          }

          var current_offer = allOffers[j],
            current_offer_slug = allOffers[j]['slug'],
            max_cmp = 0,
            best_offer = null;

          var cmp_score = parse.compare_strings(
            current_res_slug,
            current_offer_slug
          );
          if (cmp_score > max_cmp) {
            max_cmp = cmp_score;
            best_offer = allOffers[j];
          }
        }

        // now i have the best match
        if (max_cmp > 0.9 && (best_offer != null || best_offer != undefined)) {
          foundMatch = true;
          // add it to the offers set
          console.log('Match found for: ' + best_offer['slug']);
          ops.push({
            updateOne: {
              filter: {
                type: 'offers',
                added: todayDateStr,
                slug: best_offer['slug'],
                locationSlug: best_offer['locationSlug'],
                locationId: best_offer['locationId'],
                locationName: best_offer['locationName'],
              },
              update: {
                $addToSet: {
                  offers: current_res,
                },
              },
              upsert: true,
              new: true,
            },
          });
        } else {
          // no match found. have to add it to its own
          console.log('No match found for: ' + current_res['slug']);
          ops.push({
            updateOne: {
              filter: {
                type: 'offers',
                added: todayDateStr,
                slug: current_res['slug'],
                locationSlug: current_res['locationSlug'],
                locationId: current_res['locationId'],
                locationName: current_res['locationName'],
              },
              update: {
                $addToSet: {
                  offers: current_res,
                },
              },
              upsert: true,
              new: true,
            },
          });
        }

        // lets mark the restaurant as indexed
        ops.push({
          updateOne: {
            filter: {
              _id: ObjectID(current_res_id),
              type: 'restaurant',
            },
            update: {
              $set: {
                indexed: 1,
              },
            },
          },
        });
      } else {
        console.log('No offer even for: ' + current_res['slug']);
        ops.push({
          updateOne: {
            filter: {
              type: 'offers',
              added: todayDateStr,
              slug: current_res['slug'],
              locationSlug: current_res['locationSlug'],
              locationId: current_res['locationId'],
              locationName: current_res['locationName'],
            },
            update: {
              $addToSet: {
                offers: current_res,
              },
            },
            upsert: true,
            new: true,
          },
        });
        ops.push({
          updateOne: {
            filter: {
              _id: ObjectID(current_res_id),
              type: 'restaurant',
            },
            update: {
              $set: {
                indexed: 1,
              },
            },
          },
        });
      }
    }
  }

  // perform left over db operations
  if (ops.length > 0) {
    console.log('Leftover DB: Number of operations ' + ops.length);
    await db
      .collection(collectionName)
      .bulkWrite(ops, { ordered: false })
      .then(
        function(result) {
          console.log('Mongo Bulk Write Operation Complete');
          dbClient.close();
        },
        function(err) {
          console.log('Mongo Bulk Write: Promise: error ' + err);
        }
      )
      .catch(e => console.log(e));
    // .then(() => dbClient.close());
  } else {
    // dbClient.close();
  }
}

(async () => {
  reindex_setup();
})();

module.exports = {
  reindex: reindex_setup
};