const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

document.addEventListener('DOMContentLoaded', async () => {
  if (!productId) {
    document.body.innerHTML = 'Товар не указан';
    return;
  }
  await loadProduct();
  setupGallery();
  setupAddToCart();
  loadReviews();
  document.getElementById('submit-review').addEventListener('click', submitReview);
});

let product = null;
let selectedVariant = null;
let selectedRating = 0;

document.querySelectorAll('#star-rating span').forEach(star => {
  star.addEventListener('click', function() {
    selectedRating = parseInt(this.dataset.rating);
    updateStars();
  });
  star.addEventListener('mouseenter', function() {
    const rating = parseInt(this.dataset.rating);
    highlightStars(rating);
  });
  star.addEventListener('mouseleave', function() {
    updateStars();
  });
});

function highlightStars(rating) {
  document.querySelectorAll('#star-rating span').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
  });
}

function updateStars() {
  document.querySelectorAll('#star-rating span').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.rating) <= selectedRating);
  });
}

async function loadProduct() {
  try {
    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) {
      document.body.innerHTML = 'Товар не найден';
      return;
    }
    product = { id: doc.id, ...doc.data() };
    renderProduct();
    if (product.variants && product.variants.length > 0) {
      setupVariantSelector();
    }
  } catch (err) {
    console.error(err);
  }
}

function renderProduct() {
  document.getElementById('product-title').textContent = product.title;
  document.getElementById('product-description').textContent = product.description;
  document.getElementById('product-price').textContent = product.price.toLocaleString() + ' ₽';

  const images = product.images?.length ? product.images : [product.image];
  const mainImage = document.getElementById('main-image');
  mainImage.src = images[0];
  mainImage.dataset.index = 0;
  const thumbsContainer = document.getElementById('gallery-thumbs');
  thumbsContainer.innerHTML = images.map((url, idx) =>
    `<img src="${url}" class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-index="${idx}" loading="lazy">`
  ).join('');
  document.querySelectorAll('.gallery-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.dataset.index);
      mainImage.src = images[idx];
      mainImage.dataset.index = idx;
      document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}

function setupGallery() {
  const images = product.images?.length ? product.images : [product.image];
  const mainImage = document.getElementById('main-image');
  let currentIndex = 0;

  document.getElementById('gallery-left').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    mainImage.src = images[currentIndex];
    mainImage.dataset.index = currentIndex;
    updateThumbs(currentIndex);
  });
  document.getElementById('gallery-right').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % images.length;
    mainImage.src = images[currentIndex];
    mainImage.dataset.index = currentIndex;
    updateThumbs(currentIndex);
  });

  function updateThumbs(idx) {
    document.querySelectorAll('.gallery-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === idx);
    });
  }
}

function setupVariantSelector() {
  const container = document.getElementById('variant-selector');
  const variant = product.variants[0];
  const options = variant.options.filter(o => o.stock > 0);
  if (!options.length) {
    container.innerHTML = '<p>Нет в наличии</p>';
    document.getElementById('add-to-cart-btn').disabled = true;
    return;
  }

  const select = document.createElement('select');
  select.id = 'variant-select';
  select.innerHTML = options.map(o => `<option value="${o.value}">${o.value} (${o.stock} шт.)</option>`).join('');
  container.innerHTML = `<label>${variant.name}:</label>`;
  container.appendChild(select);

  const stockInfo = document.getElementById('stock-info');
  const qtyValue = document.getElementById('qty-value');
  const increaseBtn = document.getElementById('qty-increase');
  const decreaseBtn = document.getElementById('qty-decrease');

  function update() {
    const value = select.value;
    selectedVariant = { name: variant.name, value };
    const option = options.find(o => o.value === value);
    if (option) {
      stockInfo.textContent = `Доступно: ${option.stock} шт.`;
      const currentQty = parseInt(qtyValue.textContent);
      if (currentQty > option.stock) qtyValue.textContent = option.stock;
      increaseBtn.disabled = parseInt(qtyValue.textContent) >= option.stock;
      decreaseBtn.disabled = parseInt(qtyValue.textContent) <= 1;
    }
  }

  select.addEventListener('change', update);
  update();

  increaseBtn.onclick = () => {
    let qty = parseInt(qtyValue.textContent);
    const max = options.find(o => o.value === select.value).stock;
    if (qty < max) {
      qtyValue.textContent = qty + 1;
      increaseBtn.disabled = (qty + 1) >= max;
      decreaseBtn.disabled = false;
    }
  };
  decreaseBtn.onclick = () => {
    let qty = parseInt(qtyValue.textContent);
    if (qty > 1) {
      qtyValue.textContent = qty - 1;
      decreaseBtn.disabled = (qty - 1) <= 1;
      increaseBtn.disabled = false;
    }
  };
}

function setupAddToCart() {
  document.getElementById('add-to-cart-btn').addEventListener('click', () => {
    const qty = parseInt(document.getElementById('qty-value').textContent);
    if (!product) return;
    if (product.variants?.length && !selectedVariant) {
      document.getElementById('product-message').textContent = 'Выберите вариант';
      return;
    }
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existing = cart.find(item => item.id === product.id && item.variant?.value === selectedVariant?.value);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: product.id,
        title: product.title,
        price: product.price,
        image: product.images?.[0] || product.image,
        qty: qty,
        variant: selectedVariant
      });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    document.getElementById('product-message').textContent = 'Товар добавлен в корзину!';
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
    snapshot.forEach(doc => reviews.push(doc.data()));
    if (!reviews.length) {
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
  if (!author || !text || selectedRating === 0) {
    document.getElementById('review-message').textContent = 'Заполните все поля и поставьте оценку';
    return;
  }
  db.collection('reviews').add({
    productId,
    author,
    text,
    rating: selectedRating,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    approved: true
  }).then(() => {
    document.getElementById('review-message').textContent = 'Спасибо за отзыв!';
    document.getElementById('review-author').value = '';
    document.getElementById('review-text').value = '';
    selectedRating = 0;
    updateStars();
    loadReviews();
  }).catch(err => {
    document.getElementById('review-message').textContent = 'Ошибка: ' + err.message;
  });
}