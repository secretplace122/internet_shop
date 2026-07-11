const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

document.addEventListener('DOMContentLoaded', async () => {
  if (!productId) {
    document.body.innerHTML = 'Товар не указан';
    return;
  }
  await loadProduct();
  setupGallery();
  setupVariantSelector();
  setupAddToCart();
  loadReviews();
  document.getElementById('submit-review').addEventListener('click', submitReview);
});

let product = null;
let selectedVariant = null; // { name, value }

async function loadProduct() {
  try {
    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) {
      document.body.innerHTML = 'Товар не найден';
      return;
    }
    product = { id: doc.id, ...doc.data() };
    renderProduct();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = 'Ошибка загрузки товара';
  }
}

function renderProduct() {
  document.getElementById('product-title').textContent = product.title;
  document.getElementById('product-description').textContent = product.description;
  document.getElementById('product-price').textContent = product.price.toLocaleString() + ' ₽';

  const images = product.images && product.images.length ? product.images : [product.image];
  const mainImage = document.getElementById('main-image');
  mainImage.src = images[0];
  mainImage.dataset.index = 0;
  const thumbsContainer = document.getElementById('gallery-thumbs');
  thumbsContainer.innerHTML = images.map((url, idx) =>
    `<img src="${url}" class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-index="${idx}" loading="lazy">`
  ).join('');
  document.querySelectorAll('.gallery-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = thumb.dataset.index;
      mainImage.src = images[idx];
      mainImage.dataset.index = idx;
      document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}

function setupGallery() {
  let currentIdx = 0;
  const images = product.images && product.images.length ? product.images : [product.image];
  const mainImage = document.getElementById('main-image');

  document.getElementById('gallery-left').addEventListener('click', () => {
    currentIdx = (currentIdx - 1 + images.length) % images.length;
    mainImage.src = images[currentIdx];
    mainImage.dataset.index = currentIdx;
    updateThumbs(currentIdx);
  });
  document.getElementById('gallery-right').addEventListener('click', () => {
    currentIdx = (currentIdx + 1) % images.length;
    mainImage.src = images[currentIdx];
    mainImage.dataset.index = currentIdx;
    updateThumbs(currentIdx);
  });
  function updateThumbs(idx) {
    document.querySelectorAll('.gallery-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === idx);
    });
  }
}

function setupVariantSelector() {
  const container = document.getElementById('variant-selector');
  if (!product.variants || product.variants.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Для простоты поддерживаем только первый вариант (например Размер)
  const variant = product.variants[0];
  const options = variant.options.filter(o => o.stock > 0);
  if (options.length === 0) {
    container.innerHTML = '<p>Нет в наличии</p>';
    document.getElementById('add-to-cart-btn').disabled = true;
    return;
  }

  const selectHTML = `
    <label>${variant.name}:</label>
    <select id="variant-select">
      <option value="">-- Выберите --</option>
      ${options.map(o => `<option value="${o.value}">${o.value} (${o.stock} шт.)</option>`).join('')}
    </select>
  `;
  container.innerHTML = selectHTML;

  const selectEl = document.getElementById('variant-select');
  const stockInfo = document.getElementById('stock-info');
  const qtyValue = document.getElementById('qty-value');
  const increaseBtn = document.getElementById('qty-increase');
  const decreaseBtn = document.getElementById('qty-decrease');

  function updateStockInfo() {
    const value = selectEl.value;
    if (!value) {
      selectedVariant = null;
      stockInfo.textContent = '';
      qtyValue.textContent = '1';
      return;
    }
    selectedVariant = { name: variant.name, value };
    const option = options.find(o => o.value === value);
    if (option) {
      stockInfo.textContent = `Доступно: ${option.stock} шт.`;
      const currentQty = parseInt(qtyValue.textContent);
      if (currentQty > option.stock) {
        qtyValue.textContent = option.stock;
      }
      increaseBtn.disabled = parseInt(qtyValue.textContent) >= option.stock;
      decreaseBtn.disabled = parseInt(qtyValue.textContent) <= 1;
    }
  }

  selectEl.addEventListener('change', updateStockInfo);
  updateStockInfo();

  // Ограничение количества
  increaseBtn.addEventListener('click', () => {
    let current = parseInt(qtyValue.textContent);
    const max = selectedVariant ? options.find(o => o.value === selectedVariant.value).stock : product.stock;
    if (current < max) {
      qtyValue.textContent = current + 1;
      increaseBtn.disabled = (current + 1) >= max;
      decreaseBtn.disabled = false;
    }
  });
  decreaseBtn.addEventListener('click', () => {
    let current = parseInt(qtyValue.textContent);
    if (current > 1) {
      qtyValue.textContent = current - 1;
      decreaseBtn.disabled = (current - 1) <= 1;
      increaseBtn.disabled = false;
    }
  });
}

function setupAddToCart() {
  const btn = document.getElementById('add-to-cart-btn');
  btn.addEventListener('click', () => {
    const qty = parseInt(document.getElementById('qty-value').textContent);
    if (!product) return;

    // Проверка варианта
    if (product.variants && product.variants.length > 0 && !selectedVariant) {
      document.getElementById('product-message').textContent = 'Пожалуйста, выберите вариант';
      return;
    }

    // Получаем корзину из localStorage
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingIndex = cart.findIndex(item => item.id === product.id && JSON.stringify(item.variant) === JSON.stringify(selectedVariant));
    if (existingIndex >= 0) {
      cart[existingIndex].qty += qty;
    } else {
      cart.push({
        id: product.id,
        title: product.title,
        price: product.price,
        image: product.images ? product.images[0] : product.image,
        qty: qty,
        variant: selectedVariant
      });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    document.getElementById('product-message').textContent = `Товар добавлен в корзину! (${qty} шт.)`;
    // Обновляем глобальный cart на всех страницах (если используется)
    if (window.updateCartUI) window.updateCartUI();
  });
}

async function loadReviews() {
  const container = document.getElementById('reviews-list');
  try {
    const snapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .where('approved', '==', true)
      .orderBy('createdAt', 'desc')
      .get();
    const reviews = [];
    snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
    if (reviews.length === 0) {
      container.innerHTML = '<p>Пока нет отзывов.</p>';
      return;
    }
    container.innerHTML = reviews.map(r => `
      <div class="review-card">
        <div class="review-author">${r.author}</div>
        <div class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
        <div class="review-text">${r.text}</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p>Ошибка загрузки отзывов</p>';
  }
}

function submitReview() {
  const author = document.getElementById('review-author').value.trim();
  const text = document.getElementById('review-text').value.trim();
  const rating = document.querySelectorAll('#star-rating span.active').length;
  if (!author || !text || rating === 0) {
    document.getElementById('review-message').textContent = 'Заполните все поля и поставьте оценку';
    return;
  }
  db.collection('reviews').add({
    productId,
    author,
    text,
    rating,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    approved: false // администратор должен одобрить в консоли
  }).then(() => {
    document.getElementById('review-message').textContent = 'Отзыв отправлен на модерацию';
    document.getElementById('review-author').value = '';
    document.getElementById('review-text').value = '';
    document.querySelectorAll('#star-rating span').forEach(s => s.classList.remove('active'));
    loadReviews();
  }).catch(err => {
    document.getElementById('review-message').textContent = 'Ошибка: ' + err.message;
  });
}

// Звёздный рейтинг
document.addEventListener('click', (e) => {
  if (e.target.closest('#star-rating')) {
    const rating = e.target.dataset.rating;
    if (rating) {
      const stars = document.querySelectorAll('#star-rating span');
      stars.forEach(span => {
        span.classList.toggle('active', span.dataset.rating <= rating);
      });
    }
  }
});