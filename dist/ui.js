// Shared application layout. Keep content as text and compose layouts with these functions.
const element=(tag,className,text)=>{
  const node=document.createElement(tag);node.className=className;
  if(text!=null)node.textContent=text;
  return node;
};
export function actionLink({label,href,primary=false,external=false,sponsored=false}){
  const url=new URL(href,location.href);
  if(!['http:','https:'].includes(url.protocol))throw TypeError('Unsupported link destination');
  const link=element('a','ui-action'+(primary?' ui-action-primary':''),label);link.href=href;
  if(external){link.target='_blank';link.rel='noopener noreferrer'+(sponsored?' sponsored':'')}
  return link;
}
export function pageHeader({eyebrow,title,description,actions=[]}){
  const header=element('div','ui-page-header'),copy=element('div','ui-heading-copy');
  if(eyebrow)copy.append(element('p','ui-eyebrow',eyebrow));
  copy.append(element('h1','ui-page-title',title));
  if(description)copy.append(element('p','ui-description',description));
  header.append(copy);
  if(actions.length){const group=element('div','ui-actions');group.append(...actions.map(actionLink));header.append(group)}
  return header;
}
export function sectionHeader({title,description,control}){
  const header=element('div','ui-section-header'),copy=element('div','ui-heading-copy');
  copy.append(element('h2','ui-section-title',title));
  if(description)copy.append(element('p','ui-description',description));
  header.append(copy);if(control)header.append(control);return header;
}
export function contentCard({title,description,label,action}){
  const card=element('article','ui-card');
  if(label)card.append(element('span','ui-card-label',label));
  card.append(element('h3','ui-card-title',title));
  if(description)card.append(element('p','ui-card-description',description));
  if(action){
    const link=actionLink(action),arrow=element('span','ui-arrow','→');arrow.setAttribute('aria-hidden','true');
    link.append(arrow);card.append(link);
  }
  return card;
}
export function emptyState(message,title){
  const note=element(title?'div':'p','ui-empty',title?null:message);note.setAttribute('role','status');
  if(title)note.append(element('h3','ui-card-title',title),element('p','ui-description',message));
  return note;
}

export function selectionCard({label,title,description,selected=false}){
  const card=element('button','ui-choice');card.type='button';card.setAttribute('aria-pressed',String(selected));
  if(label)card.append(element('span','ui-eyebrow',label));
  card.append(element('strong','ui-choice-title',title));
  if(description)card.append(element('span','ui-choice-description',description));
  return card;
}

export function metricCard({title,value,action}){
  const card=element('article','ui-card ui-metric');
  card.append(element('h3','ui-card-title',title),element('p','ui-metric-value',String(value)));
  if(action)card.append(action);return card;
}

export function sectionNav({label,items,current}){
  const nav=element('nav','ui-section-nav');nav.setAttribute('aria-label',label);
  for(const item of items){
    const link=actionLink(item);
    if(item.href===current)link.setAttribute('aria-current','page');
    nav.append(link);
  }
  return nav;
}
export function disclosure({title,description,label,open=false}){
  const card=element('details','panel ui-disclosure');card.open=open;
  const summary=element('summary',''),copy=element('span','ui-disclosure-copy');
  if(label)copy.append(element('span','ui-eyebrow',label));
  copy.append(element('span','ui-disclosure-title',title));summary.append(copy);card.append(summary);
  if(description)card.append(element('p','ui-description',description));
  return card;
}

export function experienceSwitch({value='personal',onChange=()=>{}}={}){
  const group=element('div','ui-experience-switch');
  group.setAttribute('role','group');group.setAttribute('aria-label','Looku experience');
  for(const mode of ['personal','business']){
    const button=element('button','',mode==='personal'?'Personal':'Business');
    button.type='button';button.dataset.experience=mode;
    button.setAttribute('aria-pressed',String(mode===value));
    button.onclick=()=>{
      if(button.getAttribute('aria-pressed')==='true')return;
      for(const option of group.children)option.setAttribute('aria-pressed',String(option===button));
      onChange(mode);
    };
    button.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=group.children[['ArrowLeft','Home'].includes(event.key)?0:1];
      next.focus();next.click();
    };
    group.append(button);
  }
  return group;
}
