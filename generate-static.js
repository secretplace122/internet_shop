const admin = require('firebase-admin');
const fs = require('fs-extra');
const path = require('path');

// Инициализация Firebase Admin из переменной окружения
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function getAverageRating(productId) {
  const snapshot = await db.collection('reviews')
    .where('productId', '==', productId)
    .where('approved', '==', true)
    .get();
  let total = 0, count = 0;
  snapshot.forEach(doc => {
    total += doc.data().rating;
    count++;
  });
  if (count === 0) return { avg: '0.0', count: 0 };
  return { avg: (total / count).toFixed(1), count };
}

async function generate() {
  const template = await fs.readFile('product-template.html', 'utf8');
  const snapshot = await db.collection('products').get();
  const products = [];
  snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

  for (const product of products) {
    const { avg, count } = await getAverageRating(product.id);
    const mainImage = (product.images && product.images.length) ? product.images[0] : product.image;
    const images = product.images && product.images.length ? product.images : [product.image];

    // Галерея миниатюр
    const thumbsHtml = images.map((url, idx) =>
      `<img src="${url}" class="gallery-thumb${idx === 0 ? ' active' : ''}" data-index="${idx}" loading="lazy">`
    ).join('');

    // Варианты
    let variantsHtml = '';
    let stockInfo = '';
    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
      const variant = product.variants[0];
      const options = variant.options || [];
      const firstAvailable = options.find(o => o.stock > 0);
      const activeValue = firstAvailable ? firstAvailable.value : (options.length ? options[0].value : null);
      variantsHtml = options.map(opt =>
        `<span class="variant-pill${opt.value === activeValue ? ' active' : ''}${opt.stock === 0 ? ' disabled' : ''}"
               data-value="${opt.value}" data-stock="${opt.stock}">
           ${opt.value}
         </span>`
      ).join('');
      stockInfo = firstAvailable ? `Доступно: ${firstAvailable.stock} шт.` : 'Нет в наличии';
    } else {
      stockInfo = `Осталось: ${product.stock || 0} шт.`;
    }

    // Заполняем шаблон
    let html = template
      .replace(/{{title}}/g, product.title)
      .replace(/{{description}}/g, product.description)
      .replace(/{{price}}/g, product.price.toLocaleString())
      .replace(/{{mainImage}}/g, mainImage)
      .replace(/{{imagesThumbs}}/g, thumbsHtml)
      .replace(/{{variantPills}}/g, variantsHtml)
      .replace(/{{stockInfo}}/g, stockInfo)
      .replace(/{{avgRating}}/g, avg)
      .replace(/{{reviewCount}}/g, count.toString())
      // ID товара для product.js (если ему нужно знать, какой товар загружен)
      .replace('const productId = params.get(\'id\');', `const productId = '${product.id}';`);

    // Сохраняем страницу
    const outDir = path.join('public', 'products', product.id);
    await fs.ensureDir(outDir);
    await fs.writeFile(path.join(outDir, 'index.html'), html);
    console.log(`Generated: products/${product.id}/`);
  }

  // Копируем главную страницу и другие файлы, если нужно
  // Предположим, что index.html, css, js уже лежат в public (или копируются отдельно)
  // Здесь мы просто генерируем товары, основная структура остаётся как есть
}

generate().catch(console.error);