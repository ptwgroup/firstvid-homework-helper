const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

for (const script of scripts) {
  new Function(script);
}

new Function(fs.readFileSync('sw.js', 'utf8'));
JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));

console.log('frontend, service worker, and manifest parse ok');
