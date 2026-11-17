// Bild (Emoji) und Abteilung für einen Einkaufsartikel, über Stichwörter im Namen (deutsch und englisch).
// Treffer zählen nur am Wortanfang oder Wortende, nicht mitten im Wort. Das Wortende gewinnt, weil es im Deutschen
// das eigentliche Ding nennt ("Orangensaft" ist Saft, "Rindenmulch" ist Mulch). Bei Gleichstand gewinnt das längere Stichwort.
// Abteilungen in der Reihenfolge eines typischen Ladens.
export const SECTIONS = ['produce', 'bakery', 'dairy', 'meat', 'pantry', 'sweets', 'frozen', 'drinks', 'drugstore', 'household', 'pets', 'other'];

const TABLE = [
  // Obst und Gemüse
  ['🍎', 'produce', ['apfel', 'aepfel', 'apple']],
  ['🍌', 'produce', ['banane', 'banana']],
  ['🍊', 'produce', ['orange', 'mandarine', 'clementine', 'grapefruit']],
  ['🍋', 'produce', ['zitrone', 'limette', 'lemon', 'lime']],
  ['🍇', 'produce', ['traube', 'weintraube', 'grape']],
  ['🍓', 'produce', ['erdbeer', 'strawberr', 'himbeer', 'brombeer', 'johannisbeer', 'beere', 'beeren', 'berry']],
  ['🫐', 'produce', ['heidelbeer', 'blaubeer', 'blueberr']],
  ['🍒', 'produce', ['kirsche', 'kirschen', 'cherry']],
  ['🍐', 'produce', ['birne', 'pear']],
  ['🍑', 'produce', ['pfirsich', 'nektarine', 'aprikose', 'peach', 'pflaume', 'zwetschge']],
  ['🍉', 'produce', ['melone', 'melon']],
  ['🥝', 'produce', ['kiwi']],
  ['🍍', 'produce', ['ananas', 'pineapple']],
  ['🥭', 'produce', ['mango', 'papaya', 'maracuja']],
  ['🥥', 'produce', ['kokos', 'kokosnuss', 'coconut']],
  ['🥑', 'produce', ['avocado']],
  ['🍅', 'produce', ['tomate', 'tomato', 'cherrytomate']],
  ['🥒', 'produce', ['gurke', 'cucumber', 'zucchini']],
  ['🥕', 'produce', ['karotte', 'moehre', 'carrot']],
  ['🥔', 'produce', ['kartoffel', 'potato', 'suesskartoffel']],
  ['🧅', 'produce', ['zwiebel', 'onion', 'lauch', 'porree', 'fruehlingszwiebel', 'schalotte']],
  ['🧄', 'produce', ['knoblauch', 'garlic', 'ingwer', 'ginger']],
  ['🫑', 'produce', ['paprika', 'pepper', 'chili', 'peperoni']],
  ['🥦', 'produce', ['brokkoli', 'broccoli', 'blumenkohl', 'rosenkohl', 'kohlrabi']],
  ['🥬', 'produce', ['salat', 'lettuce', 'spinat', 'spinach', 'kohl', 'rucola', 'mangold', 'feldsalat', 'eisberg', 'chinakohl']],
  ['🍆', 'produce', ['aubergine', 'eggplant']],
  ['🍄', 'produce', ['pilz', 'pilze', 'champignon', 'champignons', 'mushroom']],
  ['🌽', 'produce', ['maiskolben']],
  ['🌿', 'produce', ['petersilie', 'basilikum', 'schnittlauch', 'dill', 'koriander', 'minze', 'rosmarin', 'thymian', 'kraeuter', 'herbs']],
  ['🥗', 'produce', ['radieschen', 'rettich', 'sellerie', 'fenchel', 'spargel', 'kuerbis', 'rote bete', 'gemuese']],
  ['🍏', 'produce', ['obst', 'fruit']],
  // Brot und Gebäck
  ['🍞', 'bakery', ['brot', 'bread', 'toast', 'toastbrot', 'baguette', 'ciabatta', 'fladenbrot', 'knaeckebrot']],
  ['🥖', 'bakery', ['broetchen', 'semmel', 'schrippe', 'weckle', 'baguettebroetchen', 'aufbackbroetchen']],
  ['🥐', 'bakery', ['croissant', 'gebaeck', 'plunder', 'franzbroetchen']],
  ['🥨', 'bakery', ['brezel', 'breze', 'laugen', 'pretzel']],
  ['🍰', 'bakery', ['kuchen', 'cake', 'torte', 'muffin', 'berliner', 'donut']],
  ['🫓', 'bakery', ['wrap', 'wraps', 'tortilla', 'tortillas', 'pita']],
  // Milch, Käse, Eier
  ['🥛', 'dairy', ['milch', 'milk', 'buttermilch', 'hafermilch', 'sojamilch', 'mandelmilch', 'kakao']],
  ['🍶', 'dairy', ['sahne', 'cream', 'schmand', 'saure sahne', 'creme fraiche', 'cremefraiche', 'kaffeesahne', 'kondensmilch']],
  ['🧈', 'dairy', ['butter', 'margarine', 'kraeuterbutter']],
  ['🥚', 'dairy', ['eier', 'ei', 'eggs', 'egg']],
  ['🧀', 'dairy', ['kaese', 'cheese', 'gouda', 'emmentaler', 'parmesan', 'mozzarella', 'feta', 'halloumi', 'camembert', 'brie', 'frischkaese', 'hirtenkaese', 'reibekaese', 'scheibenkaese', 'grana']],
  ['🥣', 'dairy', ['joghurt', 'jogurt', 'yogurt', 'quark', 'skyr', 'pudding', 'dessert', 'griessbrei', 'milchreis dessert']],
  // Fleisch und Fisch
  ['🥩', 'meat', ['fleisch', 'steak', 'rind', 'rinder', 'schwein', 'schweine', 'hack', 'hackfleisch', 'gulasch', 'schnitzel', 'kotelett', 'braten', 'meat', 'beef', 'lamm']],
  ['🍗', 'meat', ['haehnchen', 'huhn', 'chicken', 'pute', 'puten', 'gefluegel', 'chicken nuggets', 'nuggets']],
  ['🥓', 'meat', ['speck', 'bacon', 'schinken', 'ham', 'kochschinken', 'schinkenwuerfel']],
  ['🌭', 'meat', ['wurst', 'wuerstchen', 'sausage', 'salami', 'aufschnitt', 'bratwurst', 'wiener', 'leberwurst', 'mortadella', 'lyoner', 'chorizo']],
  ['🐟', 'meat', ['fisch', 'fish', 'lachs', 'salmon', 'thunfisch', 'tuna', 'forelle', 'hering', 'kabeljau', 'seelachs', 'fischstaebchen']],
  ['🦐', 'meat', ['garnele', 'garnelen', 'shrimps', 'scampi', 'meeresfruechte']],
  ['🌱', 'meat', ['tofu', 'tempeh', 'seitan', 'veggie', 'vegan']],
  // Vorrat
  ['🍚', 'pantry', ['reis', 'rice', 'risotto', 'couscous', 'bulgur', 'quinoa']],
  ['🍝', 'pantry', ['nudel', 'nudeln', 'pasta', 'spaghetti', 'penne', 'fusilli', 'lasagne', 'tortellini', 'gnocchi', 'spaetzle', 'maultaschen']],
  ['🥫', 'pantry', ['dose', 'dosen', 'tomatenmark', 'passata', 'tomatenstuecke', 'kokosmilch', 'konserve', 'mais', 'bohnen', 'kidneybohnen', 'kichererbsen', 'linsen', 'erbsen', 'suppe', 'bruehe', 'fond', 'bruehwuerfel']],
  ['🌾', 'pantry', ['mehl', 'flour', 'backpulver', 'hefe', 'trockenhefe', 'vanillezucker', 'speisestaerke', 'griess', 'paniermehl', 'backmischung']],
  ['🧂', 'pantry', ['salz', 'salt', 'pfeffer', 'gewuerz', 'gewuerze', 'paprikapulver', 'curry', 'zimt', 'oregano', 'muskat']],
  ['🍬', 'pantry', ['zucker', 'sugar', 'puderzucker', 'rohrzucker', 'suessstoff']],
  ['🫒', 'pantry', ['oel', 'olivenoel', 'rapsoel', 'sonnenblumenoel', 'oil', 'oliven', 'essig', 'balsamico']],
  ['🍅', 'pantry', ['ketchup', 'tomatensauce', 'pastasauce', 'pesto']],
  ['🥫', 'pantry', ['senf', 'mayo', 'mayonnaise', 'remoulade', 'sauce', 'sosse', 'dressing', 'grillsauce', 'bbq', 'sojasauce', 'tabasco', 'sriracha', 'worcester', 'meerrettich', 'fertiggericht', 'tuetensuppe', 'fix']],
  ['🍯', 'pantry', ['honig', 'honey', 'marmelade', 'konfituere', 'jam', 'sirup', 'ahornsirup', 'erdnussbutter', 'aufstrich']],
  ['🥣', 'pantry', ['muesli', 'cornflakes', 'haferflocken', 'oats', 'cerealien', 'porridge']],
  ['☕', 'pantry', ['kaffee', 'coffee', 'espresso', 'kaffeebohnen', 'kaffeepads', 'kapseln', 'kaffeekapseln']],
  ['🍵', 'pantry', ['tee', 'tea', 'kraeutertee', 'gruener tee', 'teebeutel']],
  ['🥜', 'pantry', ['nuesse', 'nuss', 'nuts', 'erdnuss', 'erdnuesse', 'mandeln', 'walnuesse', 'haselnuesse', 'cashew', 'pistazien', 'rosinen', 'trockenobst', 'kerne', 'sonnenblumenkerne']],
  // Süßes und Snacks
  ['🍫', 'sweets', ['schokolade', 'schoko', 'chocolate', 'nutella', 'riegel', 'praline', 'pralinen']],
  ['🍪', 'sweets', ['keks', 'kekse', 'cookie', 'cookies', 'waffeln', 'zwieback', 'butterkeks']],
  ['🍿', 'sweets', ['chips', 'popcorn', 'snack', 'snacks', 'flips', 'salzstangen', 'nachos', 'cracker']],
  ['🍭', 'sweets', ['bonbon', 'bonbons', 'gummibaerchen', 'fruchtgummi', 'lakritz', 'candy', 'suessigkeiten', 'kaugummi']],
  // Tiefkühl
  ['🍕', 'frozen', ['pizza']],
  ['🍦', 'frozen', ['eis', 'eiscreme', 'icecream', 'speiseeis', 'stieleis']],
  ['🧊', 'frozen', ['tiefkuehl', 'tk', 'frozen', 'pommes', 'kroketten', 'eiswuerfel', 'tiefkuehlgemuese', 'rahmspinat', 'fischstaebchen tk']],
  // Getränke
  ['🧃', 'drinks', ['saft', 'juice', 'schorle', 'apfelschorle', 'nektar', 'smoothie']],
  ['💧', 'drinks', ['wasser', 'water', 'sprudel', 'mineralwasser', 'stilles wasser']],
  ['🥤', 'drinks', ['cola', 'limo', 'limonade', 'fanta', 'sprite', 'soda', 'eistee', 'energy', 'energydrink', 'red bull', 'mate', 'tonic', 'sirup getraenk']],
  ['🍺', 'drinks', ['bier', 'beer', 'radler', 'weizen', 'pils', 'helles', 'alkoholfrei']],
  ['🍷', 'drinks', ['wein', 'wine', 'rotwein', 'weisswein', 'rose', 'gluehwein']],
  ['🥂', 'drinks', ['sekt', 'prosecco', 'champagner', 'secco']],
  ['🥃', 'drinks', ['schnaps', 'whisky', 'whiskey', 'gin', 'rum', 'wodka', 'vodka', 'likoer', 'aperol', 'spirituosen']],
  ['🍾', 'drinks', ['pfand', 'leergut', 'getraenke', 'kasten']],
  // Drogerie
  ['🧻', 'drugstore', ['klopapier', 'toilettenpapier', 'toilet paper', 'kuechenrolle', 'kuechenpapier', 'taschentuecher', 'tissue', 'feuchtes toilettenpapier']],
  ['🧴', 'drugstore', ['shampoo', 'spuelung', 'duschgel', 'seife', 'fluessigseife', 'soap', 'creme', 'handcreme', 'bodylotion', 'lotion', 'deo', 'deodorant', 'sonnencreme', 'sonnenschutz', 'haargel', 'haarspray']],
  ['🪥', 'drugstore', ['zahnpasta', 'zahncreme', 'zahnbuerste', 'zahnseide', 'mundspuelung', 'toothpaste']],
  ['🪒', 'drugstore', ['rasierer', 'rasierklingen', 'rasierschaum', 'klingen']],
  ['🩹', 'drugstore', ['pflaster', 'verband', 'apotheke', 'tabletten', 'medikamente', 'pharmacy', 'vitamine', 'nasenspray', 'hustensaft']],
  ['👶', 'drugstore', ['windel', 'windeln', 'diaper', 'feuchttuecher', 'babynahrung', 'brei', 'babybrei']],
  ['🍼', 'drugstore', ['pre milch', 'premilch', 'folgemilch', 'flaeschchen']],
  ['🧼', 'drugstore', ['wattepads', 'wattestaebchen', 'tampons', 'binden', 'slipeinlagen', 'kosmetik', 'make up', 'nagellack', 'abschminktuecher']],
  // Haushalt
  ['🧺', 'household', ['waschmittel', 'weichspueler', 'detergent', 'fleckentferner', 'colorwaschmittel', 'vollwaschmittel']],
  ['🧽', 'household', ['schwamm', 'schwaemme', 'sponge', 'putzmittel', 'reiniger', 'allzweckreiniger', 'badreiniger', 'wc reiniger', 'glasreiniger', 'entkalker', 'spuelmittel', 'spuelmaschinentabs', 'tabs', 'klarspueler', 'regeneriersalz', 'spuelmaschinensalz']],
  ['🧹', 'household', ['besen', 'wischmopp', 'putztuch', 'putztuecher', 'mikrofasertuch', 'lappen', 'staubsaugerbeutel']],
  ['🗑️', 'household', ['muellbeutel', 'muelltuete', 'muellsack', 'muellsaecke', 'gelbe saecke', 'biobeutel']],
  ['🧻', 'household', ['alufolie', 'frischhaltefolie', 'backpapier', 'gefrierbeutel', 'zipbeutel', 'servietten']],
  ['🔋', 'household', ['batterie', 'batterien', 'battery', 'akku', 'knopfzelle']],
  ['💡', 'household', ['gluehbirne', 'leuchtmittel', 'lampe', 'bulb', 'led']],
  ['🕯️', 'household', ['kerze', 'kerzen', 'teelicht', 'teelichter', 'candle', 'streichhoelzer', 'feuerzeug']],
  ['🪴', 'household', ['erde', 'blumenerde', 'mulch', 'rindenmulch', 'duenger', 'samen', 'pflanze', 'pflanzen']],
  ['💐', 'household', ['blumen', 'flowers', 'strauss', 'tulpen', 'rosen']],
  ['🔥', 'household', ['grillkohle', 'kohle', 'anzuender', 'grillanzuender']],
  // Tierbedarf
  ['🐶', 'pets', ['hundefutter', 'dog food', 'leckerli', 'kauknochen', 'hundekotbeutel']],
  ['🐱', 'pets', ['katzenfutter', 'katzenstreu', 'cat food', 'nassfutter', 'trockenfutter']],
  ['🐦', 'pets', ['vogelfutter', 'meisenknoedel', 'fischfutter', 'tierfutter']],
];

// Zusätzliche Bilder für die eigene Auswahl
export const EXTRA_ICONS = ['🛒', '📦', '🎁', '🧹', '🧯', '🪣', '🧤', '🧦', '👕', '📰', '✉️', '🖊️', '📎', '🍼', '🥥', '🍒', '🫐', '🥨', '🧇', '🥞', '🍔', '🌮', '🍣', '🥟', '🍜', '🧁', '🍰', '🥂', '🧉', '🍾'];
// Bild je Abteilung (für die Auswahl)
export const SECTION_ICONS = { produce: '🥕', bakery: '🍞', dairy: '🧀', meat: '🥩', pantry: '🥫', sweets: '🍫', frozen: '🧊', drinks: '🧃', drugstore: '🧴', household: '🧽', pets: '🐾', other: '🛒' };

export const ALL_ICONS = [...new Set([...TABLE.map(([emoji]) => emoji), ...EXTRA_ICONS])];

// Kleinbuchstaben, Umlaute ausgeschrieben, damit "Käse" und "Kaese" gleich behandelt werden
export function normalizeName(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .trim();
}

function best(name) {
  const text = normalizeName(name);
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  let top = null;
  for (const entry of TABLE) {
    for (const word of entry[2]) {
      let rank = 0;
      if (word.includes(' ')) rank = (` ${text} `).includes(` ${word} `) ? 4 : 0;
      else
        for (const w of words) {
          if (w === word) rank = Math.max(rank, 4);
          else if (word.length >= 3 && w.endsWith(word)) rank = Math.max(rank, 3);
          else if (word.length >= 3 && w.startsWith(word)) rank = Math.max(rank, 2);
        }
      if (!rank) continue;
      const score = rank * 100 + word.length;
      if (!top || score > top.score) top = { score, emoji: entry[0], section: entry[1] };
    }
  }
  return top;
}

export function shopIcon(name) {
  return best(name)?.emoji ?? null;
}

// Abteilung: selbst gewählt, sonst aus dem Namen, sonst aus einem selbst gewählten Bild, sonst "other"
export function shopSection(name, chosenEmoji, chosenSection) {
  if (chosenSection && SECTIONS.includes(chosenSection)) return chosenSection;
  const found = best(name);
  if (found) return found.section;
  const byEmoji = chosenEmoji && TABLE.find(([emoji]) => emoji === chosenEmoji);
  return byEmoji ? byEmoji[1] : 'other';
}
