// Shared by the wardrobe, local matcher and online styling advice.
export const clothingGroups = [
  {name:'Tops', slot:'shirt', tone:'rose', choices:[['shirt','Top / shirt'],['tshirt','T-shirt'],['blouse','Blouse'],['tank','Tank top'],['polo','Polo shirt'],['sweater','Knitwear'],['hoodie','Hoodie'],['sweatshirt','Sweatshirt']]},
  {name:'Bottoms', slot:'trousers', tone:'blue', choices:[['trousers','Trousers / bottoms'],['jeans','Jeans'],['skirt','Skirt'],['shorts','Shorts'],['leggings','Leggings'],['joggers','Joggers']]},
  {name:'One-piece outfits', slot:'dress', tone:'lilac', choices:[['dress','Dress'],['jumpsuit','Jumpsuit'],['romper','Playsuit / romper'],['suit','Suit']]},
  {name:'Layers', slot:'jacket', tone:'peach', choices:[['jacket','Jacket / layer'],['blazer','Blazer'],['coat','Coat'],['cardigan','Cardigan'],['vest','Waistcoat / vest']]},
  {name:'Footwear', slot:'shoe', tone:'mint', choices:[['shoe','Shoes'],['trainers','Trainers'],['boots','Boots'],['sandals','Sandals'],['heels','Heels'],['flats','Flats'],['loafers','Loafers']]}
];
export const categories = Object.fromEntries(clothingGroups.flatMap(group=>group.choices));
const slots = Object.fromEntries(clothingGroups.flatMap(group=>group.choices.map(([type])=>[type,group.slot])));
export const clothingSlot = type => slots[type] || type;
export const occasionGroups = [
  {name:'Day to day', tone:'mint', choices:['Everyday','Office','Weekend','Brunch','Interview']},
  {name:'Going out', tone:'rose', choices:['Evening','Date night','Party','Concert','Festival']},
  {name:'Celebrations', tone:'lilac', choices:['Wedding','Formal event','Graduation','Religious gathering']},
  {name:'On the move', tone:'blue', choices:['Travel','Beach','Workout','Outdoors']}
];
export const occasions = occasionGroups.flatMap(group=>group.choices);
export const occasionPatterns = [
  ['Date night', /\b(date(?: night)?|romantic)\b/i],
  ['Wedding', /\b(wedding|bridal|bridesmaid)\b/i],
  ['Formal event', /\b(formal|gala|black tie)\b/i],
  ['Graduation', /\b(graduation|graduate)\b/i],
  ['Religious gathering', /\b(church|mosque|temple|religious|worship)\b/i],
  ['Interview', /\b(interview)\b/i],
  ['Brunch', /\b(brunch)\b/i],
  ['Workout', /\b(workout|gym|fitness|yoga|exercise)\b/i],
  ['Beach', /\b(beach|pool|swim)\b/i],
  ['Travel', /\b(travel|airport|flight|holiday|vacation)\b/i],
  ['Outdoors', /\b(outdoor|outdoors|hike|hiking|camping)\b/i],
  ['Festival', /\b(festival)\b/i],
  ['Concert', /\b(concert|gig)\b/i],
  ['Party', /\b(party|birthday|clubbing)\b/i],
  ['Office', /\b(office|work|meeting|business)\b/i],
  ['Evening', /\b(evening|dinner|night)\b/i],
  ['Weekend', /\b(weekend|picnic)\b/i],
  ['Everyday', /\b(casual|everyday|errands|walk)\b/i]
];
