import {clothingGroups,occasionGroups} from './style-options.js';

// Keep the select as the form value, with the same change event used by callers.
export function mountChoicePickers(root) {
  for (const select of root.querySelectorAll('#filter, #occasion, select[name="type"], select[name="occasion"]')) {
    if (select.dataset.picker) continue;
    select.dataset.picker = 'true';
    const isOccasion = select.id === 'occasion' || select.name === 'occasion';
    const label = isOccasion ? 'Occasion' : 'Clothing type';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'choice-trigger';
    trigger.dataset.choiceFor = select.id || select.name;
    trigger.setAttribute('aria-haspopup','dialog');
    trigger.setAttribute('aria-expanded','false');
    function sync() {
      const selected = select.selectedOptions[0]?.textContent || 'Choose';
      trigger.textContent = selected + ' ›';
      trigger.setAttribute('aria-label',label + ': ' + selected);
    }
    sync();
    select.hidden = true;
    select.after(trigger);
    select.addEventListener('change',sync);
    trigger.addEventListener('click',()=>openChoices(select,trigger,label,isOccasion));
  }
}

function openChoices(select,trigger,label,isOccasion) {
  const dialog = document.createElement('dialog');
  dialog.className = 'choice-dialog';
  dialog.setAttribute('aria-labelledby','choice-picker-title');
  dialog.innerHTML = `<div class="choice-heading"><h2 id="choice-picker-title"></h2>
    <button type="button" class="close" aria-label="Close choices">×</button>
    <p>Tap a choice to apply it.</p>
    <label>Find a choice<input type="search" placeholder="Search choices" autocomplete="off"></label></div>
    <div class="choice-content"></div><p class="choice-empty" role="status" hidden>No matches. Try another word.</p>`;
  dialog.querySelector('h2').textContent = 'Choose ' + (isOccasion ? 'an occasion' : 'a clothing type');
  const content = dialog.querySelector('.choice-content');
  const groups = isOccasion ? occasionGroups.map(group=>({...group,choices:group.choices.map(value=>[value,value])})) : clothingGroups;
  if ([...select.options].some(option=>option.value === '')) {
    addGroup({name:'Your wardrobe',tone:'peach',choices:[['','All pieces']]});
  }
  for (const group of groups) addGroup(group);
  function addGroup(group) {
    const section = document.createElement('section');
    section.className = 'choice-section';
    const heading = document.createElement('h3');
    heading.textContent = group.name;
    const grid = document.createElement('div');
    grid.className = 'choice-grid';
    for (const [value,text] of group.choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-tile';
      button.dataset.tone = group.tone;
      button.setAttribute('aria-pressed',String(select.value === value));
      const caption = document.createElement('span');
      caption.textContent = text;
      const mark = document.createElement('span');
      mark.className = 'choice-mark';
      mark.setAttribute('aria-hidden','true');
      mark.textContent = select.value === value ? '✓' : '+';
      button.append(caption,mark);
      button.addEventListener('click',()=>{
        select.value = value;
        dialog.close();
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      grid.append(button);
    }
    section.append(heading,grid);
    content.append(section);
  }
  dialog.querySelector('input').addEventListener('input',event=>{
    const query = event.target.value.trim().toLowerCase();
    let count = 0;
    for (const section of content.children) {
      let visible = 0;
      for (const button of section.querySelectorAll('.choice-tile')) {
        const matches = (section.querySelector('h3').textContent+' '+button.textContent).toLowerCase().includes(query);
        button.hidden = !matches;
        if (matches) visible++;
      }
      section.hidden = !visible;
      count += visible;
    }
    dialog.querySelector('.choice-empty').hidden = count > 0;
  });
  dialog.querySelector('.close').onclick = ()=>dialog.close();
  dialog.addEventListener('click',event=>{
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close',()=>{
    trigger.setAttribute('aria-expanded','false');
    dialog.remove();
    requestAnimationFrame(()=>{
      const current = trigger.isConnected ? trigger : document.querySelector('[data-choice-for="'+trigger.dataset.choiceFor+'"]');
      current?.focus({preventScroll:true});
    });
  },{once:true});
  const initialChoice = dialog.querySelector('[aria-pressed="true"]') || dialog.querySelector('.choice-tile');
  initialChoice.autofocus = true;
  document.body.append(dialog);
  trigger.setAttribute('aria-expanded','true');
  dialog.showModal();
  // Focus the current choice without opening the mobile keyboard.
  initialChoice.focus({preventScroll:true});
}
