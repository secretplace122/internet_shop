const admin = require('firebase-admin');
const fs = require('fs-extra');
const path = require('path');

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
  const productTemplate = await fs.readFile('product-template.html', 'utf8');
  const indexTemplate = await fs.readFile('index-template.html', 'utf8');
  
  const snapshot = await db.collection('products').get();
  const products = [];
  snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

  await fs.emptyDir('products');

  let productListHtml = '';

  for (const product of products) {
    const { avg, count } = await getAverageRating(product.id);
    const allImages = [product.image, ...(product.images || [])];
    const mainImage = allImages[0];

    const thumbsHtml = allImages.map((url, idx) =>
      `<img src="${url}" class="gallery-thumb${idx === 0 ? ' active' : ''}" data-index="${idx}" loading="lazy">`
    ).join('');

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

    let html = productTemplate
      .replace(/{{title}}/g, product.title)
      .replace(/{{description}}/g, product.description)
      .replace(/{{price}}/g, product.price.toLocaleString())
      .replace(/{{mainImage}}/g, mainImage)
      .replace(/{{imagesThumbs}}/g, thumbsHtml)
      .replace(/{{variantPills}}/g, variantsHtml)
      .replace(/{{stockInfo}}/g, stockInfo)
      .replace(/{{avgRating}}/g, avg)
      .replace(/{{reviewCount}}/g, count.toString())
      .replace(/{{productId}}/g, product.id);

    const outDir = path.join('products', product.id);
    await fs.ensureDir(outDir);
    await fs.writeFile(path.join(outDir, 'index.html'), html);
    console.log(`Generated: products/${product.id}/`);

    productListHtml += `
      <div class="product-card" data-id="${product.id}">
        <div class="card-gallery">
          <div class="card-gallery-scroll">
            <img src="${mainImage}" alt="${product.title}" loading="lazy">
          </div>
        </div>
        <div class="product-info">
          <h3><a href="products/${product.id}/">${product.title}</a></h3>
          <p class="description">${product.description}</p>
          <div class="price">${product.price.toLocaleString()} ₽</div>
        </div>
      </div>
    `;
  }

  const indexHtml = indexTemplate.replace('{{productList}}', productListHtml);
  await fs.writeFile('index.html', indexHtml);
  console.log('Generated index.html');
}

generate().catch(console.error);