import {pageHeader,sectionHeader,contentCard,emptyState} from './ui.js';
const main=document.querySelector('main');
main.append(pageHeader({eyebrow:'Looku / Interface library',title:'A little more room to browse',description:'The same components, spacing and hierarchy used by the app. These examples update with the shared source.',actions:[{label:'Open your wishlist',href:'/app#wishlist'},{label:'Create a store',href:'/app#merchant'}]}));
const gallery=document.createElement('div');gallery.className='ui-gallery';main.append(gallery);
const section=document.createElement('section');
section.append(sectionHeader({title:'Collection cards',description:'One title, a short description and one clear next step.'}));
const grid=document.createElement('div');grid.className='ui-grid';
for(const [title,label,description] of [['Everyday pieces','Clothing','A small example collection for the component gallery.'],['A finishing touch','Accessories','Compact cards keep the collection easy to scan.'],['Weekend favourites','Independent store','Longer descriptions wrap naturally without changing the heading scale.']]){
 grid.append(contentCard({title,label,description,action:{label:'Explore stores',href:'/app#shops'}}));
}
section.append(grid);gallery.append(section);
const empty=document.createElement('section');empty.append(sectionHeader({title:'Empty and loading states',description:'A quiet message keeps the next action in view.'}),emptyState('New collections are on their way. Check back soon.'));gallery.append(empty);
const forms=document.createElement('section');
const search=document.createElement('label');search.className='ui-search';search.textContent='Find a store';
const input=document.createElement('input');input.type='search';input.placeholder='Name or category';search.append(input);
forms.append(sectionHeader({title:'A section with a control',description:'Controls align beside the heading, then stack on small screens.',control:search}));gallery.append(forms);
