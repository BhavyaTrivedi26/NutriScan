// NutriScan Content Script v5
// Extracts everything useful from the page automatically

(function () {
  'use strict';

  function scrape() {
    return {
      url:         window.location.href,
      title:       document.title,
      productName: getProductName(),
      pageText:    getCleanText(),
      metaDesc:    getMeta(),
      structuredData: getStructuredData(),
    };
  }

  function getProductName() {
    const tries = [
      () => document.querySelector('h1')?.innerText,
      () => document.querySelector('[class*="product-name" i]')?.innerText,
      () => document.querySelector('[class*="product-title" i]')?.innerText,
      () => document.querySelector('[class*="pdp-name" i]')?.innerText,
      () => document.querySelector('[class*="item-name" i]')?.innerText,
      () => document.querySelector('[itemprop="name"]')?.innerText,
      () => document.title.split(/[|\-–]/)[0],
    ];
    for (const fn of tries) {
      try {
        const t = fn()?.trim();
        if (t && t.length > 1 && t.length < 200) return t;
      } catch (_) {}
    }
    return document.title.trim().slice(0, 150);
  }

  function getMeta() {
    return [
      document.querySelector('meta[name="description"]')?.content,
      document.querySelector('meta[property="og:description"]')?.content,
      document.querySelector('meta[property="og:title"]')?.content,
    ].filter(Boolean).join(' | ').slice(0, 500);
  }

  function getStructuredData() {
    // JSON-LD structured data often has full product info
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results = [];
    scripts.forEach(s => {
      try {
        const data = JSON.parse(s.textContent);
        const flat = JSON.stringify(data);
        if (flat.includes('ingredient') || flat.includes('nutrition') ||
            flat.includes('Product') || flat.includes('FoodProduct')) {
          results.push(flat.slice(0, 2000));
        }
      } catch (_) {}
    });
    return results.join('\n').slice(0, 3000);
  }

  function getCleanText() {
    const SKIP_TAGS    = new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','SVG','PATH','HEAD','META','LINK']);
    const SKIP_CLASSES = ['nav','header','footer','cookie','cart','checkout','sidebar','popup','modal','banner','ad','advertisement','review','rating','similar','related','recommend'];

    function skip(node) {
      if (SKIP_TAGS.has(node.nodeName)) return true;
      const c = (node.className||'').toString().toLowerCase();
      const i = (node.id||'').toLowerCase();
      return SKIP_CLASSES.some(s => c.includes(s) || i.includes(s));
    }

    function walk(node) {
      if (!node) return '';
      if (skip(node)) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
      let out = '';
      for (const child of node.childNodes) {
        const p = walk(child).trim();
        if (p) out += p + '\n';
      }
      return out;
    }

    const raw  = walk(document.body);
    const seen = new Set();
    return raw.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 1)
      .filter(l => { if (seen.has(l)) return false; seen.add(l); return true; })
      .join('\n')
      .slice(0, 8000);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'scrape') {
      try { sendResponse({ ok: true, data: scrape() }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    }
    return true;
  });
})();
