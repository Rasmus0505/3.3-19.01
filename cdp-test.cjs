const ws = require('ws');
const pageId = 'D46D15381BC990CB0F41FAD479986190';
const wsUrl = 'ws://127.0.0.1:9223/devtools/page/' + pageId;
const ws2 = new ws(wsUrl);

ws2.on('open', () => {
  // Check if there are any tooltip portals in the DOM
  ws2.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: 'document.querySelectorAll("[data-radix-tooltip-content]").length'
    }
  }));
  // Check tooltip-related styles
  ws2.send(JSON.stringify({
    id: 2,
    method: 'Runtime.evaluate',
    params: {
      expression: 'JSON.stringify([...document.querySelectorAll("[data-radix-tooltip-content]")].map(el => ({tag: el.tagName, style: el.getAttribute("style"), class: el.className})))'
    }
  }));
  setTimeout(() => ws2.close(), 5000);
});

ws2.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log('Tooltip portals count:', msg.result ? msg.result.result.value : msg.result);
  }
  if (msg.id === 2) {
    console.log('Tooltip elements:', msg.result ? msg.result.result.value : msg.result);
  }
});

ws2.on('error', (e) => console.error('WS error:', e.message));
