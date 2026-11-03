// Match against the local clothing catalogue. No network or language-model dependency.
const occasions = [
  ['Office', /\b(office|work|meeting|interview|business)\b/i],
  ['Evening', /\b(evening|dinner|night|date|party|concert)\b/i],
  ['Weekend', /\b(weekend|brunch|picnic|festival)\b/i],
  ['Everyday', /\b(casual|everyday|errands|walk)\b/i]
];
const colors = {lilac:'#ad86c5',purple:'#803b96',orchid:'#ab74b8',pink:'#df72a7',blue:'#5879aa',navy:'#263650',denim:'#657e9b',black:'#222222',white:'#eeeeea',cream:'#e6dfc6',beige:'#c6b698',brown:'#87634a',olive:'#808358',green:'#558667',red:'#b7464b',yellow:'#d5b84a',grey:'#929298',gray:'#929298'};
const aliases = {shirts:'shirt',tops:'top',jackets:'jacket',coats:'coat',dresses:'dress',jeans:'denim',sneakers:'trainers',sneaker:'trainers',sneaks:'trainers',shoes:'shoe',heels:'heel',layers:'layer',pants:'trousers',trouser:'trousers'};
const normal = word => aliases[word] || word;
const words = text => (text.toLowerCase().match(/[a-z0-9]+/g)||[]).map(normal);
const noise = new Set(words('a an the i me for to my with in and or of is on please wear wearing outfit look something want style need make from some pair'));
export function garmentWords(item) {
  return new Set(words(item.name+' '+item.type+' '+({shirt:'top',jacket:'layer',trousers:'bottom',shoe:'footwear'}[item.type]||'')));
}
export function interpretLook(text, items) {
  const excluded = [];
  const positive = text.toLowerCase().replace(/\b(?:no|without|avoid|skip)\s+(?:any\s+)?([a-z]+)/g, (_,term) => { excluded.push(normal(term)); return ' '; });
  const tokens = words(positive).filter(word => !noise.has(word));
  const vocabulary = new Set(items.flatMap(item=>[...garmentWords(item)]));
  const terms = [...new Set(tokens.filter(word=>vocabulary.has(word)))];
  const color = tokens.find(word=>Object.hasOwn(colors,word));
  const occasion = occasions.find(([,pattern])=>pattern.test(positive))?.[0];
  return {text,terms,excluded,occasion,color:colors[color],colorName:color};
}
