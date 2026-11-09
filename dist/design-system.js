import {pageHeader,sectionHeader,contentCard,emptyState,selectionCard,metricCard} from './ui.js';
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

const choices=document.createElement('section');choices.append(sectionHeader({title:'Service selection',description:'An accessible choice stays selected while the member completes the next step.'}));
const choiceGrid=document.createElement('div');choiceGrid.className='ui-choice-grid';
for(const [index,title] of ['Fashion stylist','Makeup artist','Hair stylist'].entries()){
 const card=selectionCard({label:'0'+(index+1),title,description:'A service option with room for a short description.',selected:index===0});
 card.onclick=()=>{for(const item of choiceGrid.children)item.setAttribute('aria-pressed',String(item===card))};choiceGrid.append(card);
}
choices.append(choiceGrid);gallery.append(choices);
const workspace=document.createElement('section');workspace.append(sectionHeader({title:'Task and history',description:'A focused task beside its supporting details, stacked on a phone.'}));
const pair=document.createElement('div');pair.className='ui-two-column';
for(const [title,message] of [['Your next step','Keep the primary action in this panel.'],['Your activity','An empty state explains what will appear here.']]){
 const panel=document.createElement('section');panel.className='panel';panel.append(sectionHeader({title}),emptyState(message));pair.append(panel);
}
workspace.append(pair);gallery.append(workspace);

const metrics=document.createElement('section');metrics.append(sectionHeader({title:'Workspace metrics',description:'Admin summaries use the same cards and spacing.'}));
const metricGrid=document.createElement('div');metricGrid.className='ui-grid';
metricGrid.append(metricCard({title:'Example requests',value:12}),metricCard({title:'Example stores',value:4}));metrics.append(metricGrid);gallery.append(metrics);
