import {sectionHeader, contentCard, emptyState, actionLink} from './ui.js';

const node = (tag, text) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  return element;
};
export function money(minor, decimals = 2) {
  const value = BigInt(minor), sign = value < 0n ? '−' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(decimals + 1, '0');
  return sign + digits.slice(0, -decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + digits.slice(-decimals);
}
export function summarizeEntries(entries) {
  const totals = {KES: {income: 0n, expense: 0n}, USD: {income: 0n, expense: 0n}}, seen = new Set();
  for (const entry of entries) {
    if (entry.voidedAt || seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (!Object.hasOwn(totals, entry.currency) || !['income', 'expense'].includes(entry.kind) || !/^\d+$/.test(entry.amountMinor)) throw Error('An earnings entry has invalid amounts. Totals could not be calculated.');
    totals[entry.currency][entry.kind] += BigInt(entry.amountMinor);
  }
  return totals;
}
function stroops(value) {
  if (typeof value !== 'string' || !/^\d{1,15}(?:\.\d{1,7})?$/.test(value)) throw Error('An order has invalid payment amounts. Totals could not be calculated.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, '0'));
}
export function summarizeOrders(orders) {
  const totals = {sales: 0n, earned: 0n, pending: 0n, paidOrders: 0};
  const purchases = new Set(), payouts = new Set();
  for (const order of orders) {
    if (order.network !== 'stellar:testnet' || order.currency !== 'XLM' || !/^[a-f0-9]{64}$/i.test(order.purchaseTx)) continue;
    if (purchases.has(order.purchaseTx)) continue;
    purchases.add(order.purchaseTx);
    totals.sales += stroops(order.amount);
    totals.paidOrders++;
    if (order.status === 'complete' && /^[a-f0-9]{64}$/i.test(order.payoutTx) && !payouts.has(order.payoutTx)) {
      payouts.add(order.payoutTx);
      totals.earned += stroops(order.commission);
    } else if (order.status === 'payout_pending') totals.pending += stroops(order.commission);
  }
  return totals;
}

export async function mountEarnings(root, api) {
  const status = emptyState('Loading earnings…');
  const controls = node('div');controls.className = 'ui-actions';
  const refresh = node('button', 'Refresh earnings');refresh.type = 'button';controls.append(refresh);
  const results = node('div');
  root.append(node('p', 'All-time recorded results. Profit equals recorded income minus recorded expenses in each currency. Add all income, fees, refunds and operating costs for complete figures.'), controls, status, results);

  async function pages(source) {
    const items = [], cursors = new Set();let cursor;
    do {
      const page = await api('earnings?source=' + source + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      items.push(...page.items);cursor = page.next;
      if (cursor && cursors.has(cursor)) throw Error('The report could not finish loading. Refresh earnings.');
      cursors.add(cursor);
    } while (cursor && root.isConnected);
    return items;
  }
  async function load() {
    refresh.disabled = true;status.textContent = 'Loading earnings…';results.replaceChildren();
    try {
      const [entries, orders] = await Promise.all([pages('entries'), pages('orders')]);
      if (!root.isConnected) return;
      const totals = summarizeEntries(entries), testnet = summarizeOrders(orders);
      const moneySection = node('section');moneySection.className = 'ui-section';
      moneySection.append(sectionHeader({title: 'Real-money records', description: 'Manually recorded income and expenses. External affiliate settlements can be entered once received.'}));
      for (const currency of ['KES', 'USD']) {
        const {income, expense} = totals[currency], grid = node('div');grid.className = 'ui-grid';
        for (const [title, amount] of [['Recorded income', income], ['Recorded expenses', expense], ['Recorded profit', income - expense]]) {
          grid.append(contentCard({title: currency + ' ' + money(amount), label: currency + ' · ' + title}));
        }
        const note = node('p', currency + ' totals use your active entries. Voided entries are excluded.');note.className = 'ui-meta';moneySection.append(grid, note);
      }
      results.append(moneySection);
      recordForm();
      entryList(entries);
      const demo = node('section');demo.className = 'ui-section';
      demo.append(sectionHeader({title: 'Testnet referral payouts', description: 'Demo XLM has no real-money value. These payments are excluded from the KES and USD totals.'}));
      const grid = node('div');grid.className = 'ui-grid';
      grid.append(contentCard({label: 'Received referral earnings', title: money(testnet.earned, 7) + ' test XLM', description: 'Confirmed payouts to Looku.'}),
        contentCard({label: 'Pending referral earnings', title: money(testnet.pending, 7) + ' test XLM', description: 'Paid orders awaiting the referral payout.'}),
        contentCard({label: 'Boutique sales', title: money(testnet.sales, 7) + ' test XLM', description: testnet.paidOrders + ' confirmed purchases paid to the boutique.'}));
      demo.append(grid);results.append(demo);
      const paid = orders.filter(order => /^[a-f0-9]{64}$/i.test(order.purchaseTx));
      if (!paid.length) demo.append(emptyState('No confirmed demo purchases recorded yet.'));
      appendList(demo, paid, order => {
        const card = contentCard({title: 'Order ' + order.id.slice(0, 8), description: order.status.replaceAll('_', ' '), label: order.paidAt || order.createdAt || 'Date unavailable for this older order'});
        const actions = node('div');actions.className = 'ui-actions';
        for (const [label, hash] of [['Purchase transaction', order.purchaseTx], ['Referral payout', order.payoutTx]]) {
          if (/^[a-f0-9]{64}$/i.test(hash)) actions.append(actionLink({label, href: 'https://stellar.expert/explorer/testnet/tx/' + hash, external: true}));
        }
        if (order.status === 'payout_pending') {
          const recheck = node('button', 'Recheck payout');recheck.type = 'button';
          recheck.onclick = async () => {
            recheck.disabled = true;
            try {await api('recheck-payout', {id: order.id});await load()}
            catch (error) {status.textContent = error.message;recheck.disabled = false}
          };
          actions.append(recheck);
        }
        card.append(actions);return card;
      });
      status.textContent = 'Updated ' + new Date().toLocaleString() + '. All pages loaded.';
      return true;
    } catch (error) {results.replaceChildren();status.textContent = error.message;return false}
    finally {refresh.disabled = false}
  }
  function appendList(parent, entries, render) {
    const list = node('div');list.className = 'stack';parent.append(list);
    const more = node('button', 'Show more transactions');more.type = 'button';parent.append(more);
    let shown = 0;
    const draw = () => {
      const next = entries.slice(shown, shown + 20);shown += next.length;
      list.append(...next.map(render));more.hidden = shown >= entries.length;
    };
    more.onclick = draw;draw();
  }
  function recordForm() {
    const section = node('section');section.className = 'ui-section';
    section.append(sectionHeader({title: 'Record income or expense', description: 'Enter amounts that have been received or paid. Record fees and refunds as expenses.'}));
    const form = node('form');form.className = 'stack panel ui-form-panel';
    const field = (label, input) => {const wrapper = node('label', label);wrapper.append(input);form.append(wrapper);return input};
    const select = (label, options) => {
      const input = node('select');
      for (const [value, text] of options) {const option = node('option', text);option.value = value;input.append(option)}
      return field(label, input);
    };
    const kind = select('Entry type', [['income', 'Income'], ['expense', 'Expense']]);
    const currency = select('Currency', [['KES', 'KES'], ['USD', 'USD']]);
    const amount = field('Amount', node('input'));amount.type = 'text';amount.inputMode = 'decimal';amount.pattern = '[0-9]{1,10}(\\.[0-9]{1,2})?';amount.required = true;
    const date = field('Transaction date', node('input'));date.type = 'date';date.required = true;
    const today = new Date();date.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    const description = field('Description', node('input'));description.required = true;description.maxLength = 200;
    const submit = node('button', 'Save entry'), message = node('p');message.setAttribute('role', 'status');form.append(submit, message);
    let id = crypto.randomUUID();
    form.onsubmit = async event => {
      event.preventDefault();submit.disabled = true;message.textContent = 'Saving entry…';
      try {
        await api('earnings', {action: 'record', id, kind: kind.value, currency: currency.value, amount: amount.value.trim(), date: date.value, description: description.value});
        id = crypto.randomUUID();
        if (await load()) status.textContent = 'Entry saved. Earnings and profit updated.';
        else status.textContent = 'Entry saved. ' + status.textContent;
      } catch (error) {message.textContent = error.message}
      finally {submit.disabled = false}
    };
    section.append(form);results.append(section);
  }
  function entryList(entries) {
    const section = node('section');section.className = 'ui-section';
    section.append(sectionHeader({title: 'Income and expense history', description: 'Void an incorrect entry and record a replacement. The original entry stays in the history.'}));
    if (!entries.length) section.append(emptyState('No income or expenses recorded yet.'));
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    appendList(section, sorted, entry => {
      const card = contentCard({title: entry.description, label: entry.date + ' · ' + entry.kind + (entry.voidedAt ? ' · Voided' : ''), description: entry.currency + ' ' + money(entry.amountMinor)});
      if (!entry.voidedAt) {
        const remove = node('button', 'Void entry');remove.type = 'button';remove.className = 'secondary';
        remove.onclick = async () => {
          if (!confirm('Void this ' + entry.currency + ' ' + money(entry.amountMinor) + ' entry? It will be excluded from profit totals.')) return;
          remove.disabled = true;
          try {await api('earnings', {action: 'void', id: entry.id, revision: entry.revision});await load()}
          catch (error) {status.textContent = error.message;remove.disabled = false}
        };
        card.append(remove);
      }
      return card;
    });
    results.append(section);
  }
  refresh.onclick = load;
  await load();
}
