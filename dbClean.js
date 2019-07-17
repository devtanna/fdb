const settings = require('./settings');

async function cleanDB() {
  // ########## START DB STUFF ####################
  var db;
  var dbClient;
  // Initialize connection once at the top of the scraper
  var MongoClient = require('mongodb').MongoClient;
  MongoClient.connect(
    settings.DB_CONNECT_URL,
    { useNewUrlParser: true },
    function(err, client) {
      if (err) throw err;
      db = client.db(settings.DB_NAME);
      dbClient = client;
      console.log(
        '... Cleanup script:Connected to mongo! ... at: ' +
          settings.DB_CONNECT_URL
      );
      cleanupOldCollections(db);
      dbClient.close();
      console.log('Cleanup Done');
    }
  );
  // ########## END DB STUFF ####################
}

function cleanupOldCollections(db) {
  var collectionName = settings.MONGO_COLLECTION_NAME;
  db.collection(collectionName)
    .drop()
    .catch(e => {});
}

(async () => {
  cleanDB();
})();

module.exports = {
  cleanDB
};