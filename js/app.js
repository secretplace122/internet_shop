// js/app.js

const API_URL = 'https://d5djm54iuohgreoj1bch.apigw.yandexcloud.net';

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    setupCart();
});

let cart = JSON.parse(localStorage.getItem('cart')) || [];

// ==================== ЗАГРУЗКА ТОВАРОВ ====================
async function loadProducts() {
    const container = document.getElementById('products-container');
    container.innerHTML = '<p>Загрузка товаров...</p>';

    try {
        if (typeof db === 'undefined') {
            throw new Error('Firebase не подключена');
        }
        const snapshot = await db.collection('products').where('stock', '>', 0).get();
        const products = [];
        snapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });
        renderProducts(products);
    } catch (error) {
        console.warn('Ошибка загрузки из Firestore, используем мок-данные:', error);
        const mockProducts = [
            {
                id: '1',
                title: 'Умные часы',
                description: 'Стильные часы с функцией отслеживания здоровья.',
                price: 4990,
                image: 'https://via.placeholder.com/300x200?text=Watch',
                badge: { text: 'Хит', color: '#fff', bgColor: '#e53e3e' }
            },
            {
                id: '2',
                title: 'Беспроводные наушники',
                description: 'Качественный звук и активное шумоподавление.',
                price: 3490,
                image: 'https://via.placeholder.com/300x200?text=Headphones',
                badge: null
            },
            {
                id: '3',
                title: 'Портативная колонка',
                description: 'Мощный звук в компактном корпусе.',
                price: 2490,
                image: 'https://via.placeholder.com/300x200?text=Speaker',
                badge: { text: '-20%', color: '#fff', bgColor: '#38a169' }
            }
        ];
        renderProducts(mockProducts);
    }
}

function renderProducts(products) {
    const container = document.getElementById('products-container');
    if (products.length === 0) {
        container.innerHTML = '<p>Товаров пока нет.</p>';
        return;
    }
    container.innerHTML = products.map(p => {
        const badgeHtml = p.badge && p.badge.text ?
            `<span class="badge" style="background-color: ${p.badge.bgColor}; color: ${p.badge.color}">${p.badge.text}</span>`
            : '';
        return `
      <div class="product-card" data-id="${p.id}">
        <div style="position: relative;">
          <img src="${p.image}" alt="${p.title}" loading="lazy">
          ${badgeHtml}
        </div>
        <div class="product-info">
          <h3>${p.title}</h3>
          <p class="description">${p.description}</p>
          <span class="price">${p.price.toLocaleString()} ₽</span>
          <button class="add-to-cart">В корзину</button>
        </div>
      </div>
    `;
    }).join('');

    document.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            const id = card.dataset.id;
            const product = products.find(p => p.id === id);
            addToCart(product);
        });
    });
}

// ==================== КОРЗИНА ====================
function setupCart() {
    updateCartUI();
    const modal = document.getElementById('cart-modal');
    const floatBtn = document.getElementById('cart-float-btn');
    const closeBtn = modal.querySelector('.close');

    floatBtn.addEventListener('click', () => {
        renderCart();
        modal.style.display = 'flex';
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('checkout-btn').addEventListener('click', () => {
        if (cart.length === 0) {
            alert('Корзина пуста');
            return;
        }
        modal.style.display = 'none';
        showCheckoutForm();
    });
}

function addToCart(product) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({
            id: product.id,
            title: product.title,
            price: product.price,
            image: product.image,
            qty: 1
        });
    }
    saveCart();
    updateCartUI();
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    updateCartUI();
    renderCart();
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cart-count').textContent = count;
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total-price');
    if (cart.length === 0) {
        container.innerHTML = '<p>Корзина пуста</p>';
        totalEl.textContent = '0';
        return;
    }
    container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <span>${item.title} x${item.qty}</span>
      <span>${(item.price * item.qty).toLocaleString()} ₽</span>
      <button class="remove-item" data-id="${item.id}">&times;</button>
    </div>
  `).join('');

    document.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            removeFromCart(e.target.dataset.id);
        });
    });

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    totalEl.textContent = total.toLocaleString();
}

// ==================== ОФОРМЛЕНИЕ ЗАКАЗА ====================
function showCheckoutForm() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.style.display = 'flex';
    overlay.id = 'checkout-modal';

    overlay.innerHTML = `
    <div class="modal-content">
      <span class="close" id="checkout-close">&times;</span>
      <h2>Оформление заказа</h2>
      <p><strong>Итого: ${total.toLocaleString()} ₽</strong></p>
      <form id="checkout-form">
        <label>Имя *</label>
        <input type="text" id="customer-name" required placeholder="Иван Иванов">
        
        <label>Телефон *</label>
        <input type="tel" id="customer-phone" required placeholder="+7 999 123-45-67">
        
        <label>Email</label>
        <input type="email" id="customer-email" placeholder="ivan@example.com">
        
        <label>Адрес доставки *</label>
        <textarea id="customer-address" rows="2" required placeholder="Город, улица, дом, квартира"></textarea>
        
        <button type="submit" class="btn" id="pay-btn">Перейти к оплате</button>
      </form>
      <p id="checkout-error" class="error"></p>
    </div>
  `;

    document.body.appendChild(overlay);

    document.getElementById('checkout-close').addEventListener('click', () => {
        overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.getElementById('checkout-form').addEventListener('submit', async function(e) {
        e.preventDefault();

        const payBtn = document.getElementById('pay-btn');
        const errorEl = document.getElementById('checkout-error');
        
        if (cart.length === 0) {
            errorEl.textContent = 'Корзина пуста';
            return;
        }

        payBtn.disabled = true;
        payBtn.textContent = 'Создаём заказ...';
        errorEl.textContent = '';

        const orderData = {
            path: '/api/create-payment',
            items: cart.map(item => ({
                id: item.id,
                qty: item.qty
            })),
            customerName: document.getElementById('customer-name').value.trim(),
            customerPhone: document.getElementById('customer-phone').value.trim(),
            customerEmail: document.getElementById('customer-email').value.trim(),
            deliveryAddress: document.getElementById('customer-address').value.trim()
        };

        try {
            const response = await fetch(API_URL + '/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            if (result.paymentUrl) {
                cart = [];
                saveCart();
                updateCartUI();
                window.location.href = result.paymentUrl;
            } else {
                throw new Error('Не получена ссылка на оплату');
            }
        } catch (err) {
            errorEl.textContent = 'Ошибка: ' + err.message;
            payBtn.disabled = false;
            payBtn.textContent = 'Перейти к оплате';
        }
    });
}