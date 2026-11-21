// Petit serveur du QG — aucune dépendance, uniquement les modules fournis avec Node.
// Il sert le dossier ../site et n'écoute que sur 127.0.0.1 : il n'est joignable que depuis cet ordinateur.
//
// Lancement :  node live/server.js
// Autre port : PORT=9000 node live/server.js   (PowerShell : $env:PORT=9000; node live/server.js)

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.resolve(__dirname, '..', 'site');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Adresse invalide');
  }

  // Le chemin demandé doit rester à l'intérieur du dossier site (pas de « ../ »).
  let file = path.resolve(ROOT, '.' + path.sep + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Accès refusé');

  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) { file = path.join(file, 'index.html'); return serve(file); }
    if (err) return send(res, 404, 'Introuvable : ' + pathname);
    serve(file, stat);
  });

  function serve(f, knownStat) {
    const go = (stat) => {
      const type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
    };
    if (knownStat) return go(knownStat);
    fs.stat(f, (err, stat) => (err || !stat.isFile()) ? send(res, 404, 'Introuvable : ' + pathname) : go(stat));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Le port ${PORT} est déjà utilisé. Essaie un autre port (variable PORT).`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`QG JILL KORP prêt : http://${HOST}:${PORT}`);
  console.log('Accessible uniquement depuis cet ordinateur. Ctrl+C pour arrêter.');
});
