function slugify(string) {
  const a = 'àáäâãåăæçèéëêǵḧìíïîḿńǹñòóöôœṕŕßśșțùúüûǘẃẍÿź·/_,:;';
  const b = 'aaaaaaaaceeeeghiiiimnnnoooooprssstuuuuuwxyz------';
  const p = new RegExp(a.split('').join('|'), 'g');

  return string
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word characters
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

function similarity(s1, s2) {
  var longer = s1;
  var shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if (longerLength == 0) {
    return 1.0;
  }
  return (
    (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  );
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function calculateScore(item) {
  var score = 0,
    rating = item['rating'],
    offer = item['offer'],
    source = item['source'];

  if (!offer) return;

  var offerMapping = {
    11: [
      /^(\d+)% off all orders$/im,
      /^(\d+)% off$/im,
      /^(\d+)% off on all orders$/im,
      /^(\d+)% off on all orders from/im,
      /^(\d+)% off on your first order$/im,
      /^(\d+)% off on your first order from/im,
      /^(\d+)% discount on food and beverage$/im,
      /^(\d+)% off on all dine-in and home-delivery orders$/im,
      /^discount of (\d+)% on your total bill$/im,
    ],
    10: [/^(\d+)% off selected items$/im],
    9: [
      /^(\d+)% off orders above aed\s*(\d+(.\d+)*)$/im,
      /^(\d+)% off on all orders above\s*(\d+(.\d+)*)$/im,
      /^(\d+)% off on all orders above\s*(\d+(.\d+)*)/im,
      /^(\d+)% off on all orders above aed\s*(\d+(.\d+)*)$/im,
      /^(\d+)% off on all orders above aed\s*(\d+(.\d+)*) from/im,
    ],
    8: [
      /^2 for 1$/im,
      /^bogo$/im,
      /^Cheap Eats$/im,
      /^Free Dessert$/im,
      /^buy 1 get 1 free$/im,
      /^special offer: buy one get one free!$/im,
    ],
    7: [/^aed (\d+(.\d+)*) off all orders$/im],

    6: [/^(\d+) aed meals$/im, /^(\d+) aed meal$/im],

    5: [/^aed (\d+(.\d+)*) off selected items$/im],

    4: [
      /^free item with orders over aed (\d+(.\d+)*)$/im,
      /^free [\w\s]+ with orders over aed (\d+(.\d+)*)$/im,
      /^spend aed (\d+(.\d+)*), get (\d+)% off$/im,
    ],

    3: [/^special offers on menu items$/im, /^special offer$/im],

    2: [/^(feel good)*\s*meal deals$/im],

    1: [/^free delivery$/im, /^(\d+)% off on dine-in$/im],
  };
  let scoreLevel, scoreValue;
  let foundMatch = false;
  Object.entries(offerMapping).some(([mapScore, regexes]) => {
    regexes.some(regex => {
      let regexMatchObject = offer.match(regex);
      scoreLevel = regexMatchObject ? mapScore : -1;
      scoreValue =
        regexMatchObject && regexMatchObject[1] ? regexMatchObject[1] : -1;

      if (regexMatchObject) {
        foundMatch = true;
        return true;
      }
    });
    if (foundMatch) return true;
  });

  if (!foundMatch || scoreLevel <= 0) {
    console.log('NO SCORE ASSIGNED FOR: ' + offer);
  }

  return { scoreLevel, scoreValue };
}

module.exports = {
  slugify: slugify,
  stringDistance: similarity,
  calculateScore: calculateScore,
};
