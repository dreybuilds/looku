import {mountStorefront} from './merchant-stores.js';
const match=location.hostname.match(/^([a-z0-9-]+)\.lookuwear\.xyz$/);
const slug=match&&!['www','admin'].includes(match[1])?match[1]:location.pathname.split('/')[2];
await mountStorefront(document.querySelector('main'),slug||'');
