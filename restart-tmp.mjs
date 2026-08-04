import { io } from 'socket.io-client';
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${m}`);
const s = io('https://www.yapstage.com', { forceNew: true, transports: ['websocket'], reconnection: false });
s.on('connect', () => {
  log('connected');
  s.emit('bot:start', { sessionId: 'rs-' + Date.now(), name: 'probebot', botId: 'fox', topicMode: 'random', side: 'FOR', lang: 'en', pace: 'long' }, (r) => log('debate started: ' + JSON.stringify(r)));
});
// deliberately never pass a turn: stay in_debate while the deploy happens
s.on('debate:phase', (p) => log(`phase step=${p.stepIndex} (${p.activeSpeaker})`));
s.on('debate:aborted', (p) => log('>>> debate:aborted ' + JSON.stringify(p)));
s.on('disconnect', (r) => { log('socket closed: ' + r); process.exit(0); });
setTimeout(() => { log('probe giving up'); process.exit(0); }, 420000);
