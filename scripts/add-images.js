const fs = require('fs');
let content = fs.readFileSync('lib/shop/catalog-data.ts', 'utf8');
content = content.replace(/sku: 'NM-([^']+)',([^}]+), emoji: '([^']+)', rating: ([\d.]+) }/g, (match, sku, rest, emoji, rating) => {
  return `sku: 'NM-${sku}',${rest}, emoji: '${emoji}', imageUrl: 'https://picsum.photos/seed/NM-${sku}/400/400', rating: ${rating} }`;
});
fs.writeFileSync('lib/shop/catalog-data.ts', content);
