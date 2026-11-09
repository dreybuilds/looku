const prefix = 'admin/finance/entries/';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const reply = (status, data) => Response.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});

function entryData(data) {
  if (!uuid.test(data.id) || !['income', 'expense'].includes(data.kind) || !['KES', 'USD'].includes(data.currency)) return null;
  if (typeof data.amount !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(data.amount)) return null;
  const [whole, fraction = ''] = data.amount.split('.');
  const amountMinor = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
  if (amountMinor === '0') return null;
  if (typeof data.description !== 'string' || !data.description.trim() || data.description.length > 200) return null;
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
  const date = new Date(data.date + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) return null;
  return {id: data.id, kind: data.kind, currency: data.currency, amountMinor, date: data.date, description: data.description.trim()};
}

export async function earnings(request, store, data) {
  if (request.method === 'GET') {
    const query = new URL(request.url).searchParams;
    const source = query.get('source') || 'entries';
    if (!['entries', 'orders'].includes(source)) return reply(400, {error: 'Unknown earnings source.'});
    const page = await store.list({prefix: source === 'orders' ? 'orders/' : prefix, limit: 30, cursor: query.get('cursor') || undefined});
    const items = await Promise.all(page.objects.map(async ({key}) => {
      const record = await store.get(key);
      if (!record) return null;
      const row = await record.json();
      if (source === 'entries') {
        const {id, kind, currency, amountMinor, date, description, createdAt, voidedAt} = row;
        return {id, kind, currency, amountMinor, date, description, createdAt, voidedAt, revision: record.etag};
      }
      // Orders created before financial snapshots used the fixed 1 / 0.10 test XLM terms.
      const {id, status, purchaseTx, payoutTx, createdAt, paidAt} = row;
      return {id, status, purchaseTx, payoutTx, createdAt, paidAt,
        amount: row.amount ?? '1.00', commission: row.commission ?? '0.10',
        currency: row.currency ?? 'XLM', network: row.network ?? 'stellar:testnet'};
    }));
    return reply(200, {items: items.filter(Boolean), next: page.truncated ? page.cursor : null});
  }
  if (request.method !== 'POST') return reply(405, {error: 'Unsupported earnings action.'});
  if (data.action === 'void') {
    if (!uuid.test(data.id) || typeof data.revision !== 'string') return reply(400, {error: 'Choose a recorded entry.'});
    const key = prefix + data.id, record = await store.get(key);
    if (!record) return reply(404, {error: 'Entry not found.'});
    const row = await record.json();
    if (row.voidedAt) return reply(200, {ok: true});
    if (record.etag !== data.revision) return reply(409, {error: 'This entry changed. Refresh earnings and try again.'});
    const saved = await store.put(key, JSON.stringify({...row, voidedAt: new Date().toISOString()}), {onlyIf: {etagMatches: record.etag}});
    return saved ? reply(200, {ok: true}) : reply(409, {error: 'This entry changed. Refresh earnings and try again.'});
  }
  if (data.action !== 'record') return reply(400, {error: 'Unknown earnings action.'});
  const entry = entryData(data);
  if (!entry) return reply(400, {error: 'Enter income or expense, KES or USD, a positive amount with up to two decimals, a valid date and a description.'});
  const key = prefix + entry.id;
  const saved = await store.put(key, JSON.stringify({...entry, createdAt: new Date().toISOString()}), {onlyIf: {etagDoesNotMatch: '*'}});
  if (saved) return reply(201, {ok: true});
  const existing = await (await store.get(key))?.json();
  if (existing && !existing.voidedAt && Object.entries(entry).every(([key, value]) => existing[key] === value)) return reply(200, {ok: true});
  return reply(409, {error: 'This entry was already recorded with different details. Refresh earnings before adding another entry.'});
}
