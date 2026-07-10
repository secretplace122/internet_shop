document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const db = firebase.firestore();

  const loginScreen = document.getElementById('login-screen');
  const adminScreen = document.getElementById('admin-screen');

  // Вход
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      errorEl.textContent = 'Ошибка входа: ' + err.message;
    }
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      loginScreen.style.display = 'none';
      adminScreen.style.display = 'block';
      loadProducts();
      loadOrders();
    } else {
      loginScreen.style.display = 'block';
      adminScreen.style.display = 'none';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

  // Вкладки
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      const tabId = 'tab-' + btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');
      if (btn.dataset.tab === 'orders') loadOrders();
    });
  });

  // Модальные окна
  const productModal = document.getElementById('product-modal');
  const supplyModal = document.getElementById('supply-modal');

  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      productModal.style.display = 'none';
      supplyModal.style.display = 'none';
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target === productModal) productModal.style.display = 'none';
    if (e.target === supplyModal) supplyModal.style.display = 'none';
  });

  document.getElementById('product-has-badge').addEventListener('change', (e) => {
    document.getElementById('badge-settings').style.display = e.target.checked ? 'block' : 'none';
  });

  // Добавление товара
  document.getElementById('add-product-btn').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Добавить товар';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('badge-settings').style.display = 'none';
    productModal.style.display = 'flex';
  });

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const hasBadge = document.getElementById('product-has-badge').checked;

    const productData = {
      title: document.getElementById('product-title').value,
      description: document.getElementById('product-description').value,
      price: parseInt(document.getElementById('product-price').value),
      stock: parseInt(document.getElementById('product-stock').value),
      image: document.getElementById('product-image').value,
      badge: null
    };

    if (hasBadge) {
      productData.badge = {
        text: document.getElementById('badge-text').value || 'Акция',
        bgColor: document.getElementById('badge-bg').value,
        color: document.getElementById('badge-color').value
      };
    }

    try {
      if (id) {
        await db.collection('products').doc(id).update(productData);
      } else {
        await db.collection('products').add(productData);
      }
      productModal.style.display = 'none';
      loadProducts();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  });

  // Поставка
  document.getElementById('supply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('supply-product-id').value;
    const qty = parseInt(document.getElementById('supply-qty').value);
    const currentStock = parseInt(document.getElementById('supply-current-stock').textContent);

    try {
      await db.collection('products').doc(id).update({
        stock: currentStock + qty
      });
      supplyModal.style.display = 'none';
      loadProducts();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  });

  async function loadProducts() {
    const tbody = document.querySelector('#products-list');
    tbody.innerHTML = '<p>Загрузка...</p>';

    try {
      const snapshot = await db.collection('products').get();
      const products = [];
      snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

      if (products.length === 0) {
        tbody.innerHTML = '<p>Товаров пока нет. Нажмите "Добавить товар".</p>';
        return;
      }

      tbody.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Фото</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Остаток</th>
              <th>Бирка</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td><img src="${p.image}" alt="${p.title}"></td>
                <td>${p.title}</td>
                <td>${p.price.toLocaleString()} ₽</td>
                <td>${p.stock}</td>
                <td>${p.badge ? `<span class="badge-preview" style="background:${p.badge.bgColor};color:${p.badge.color}">${p.badge.text}</span>` : '—'}</td>
                <td class="actions">
                  <button class="btn-sm supply" data-id="${p.id}" data-name="${p.title}" data-stock="${p.stock}">Поставка</button>
                  <button class="btn-sm edit" data-id="${p.id}">✏️</button>
                  <button class="btn-sm danger delete" data-id="${p.id}">🗑</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      tbody.querySelectorAll('.edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const product = products.find(p => p.id === id);
          editProduct(product);
        });
      });

      tbody.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Удалить товар?')) {
            await db.collection('products').doc(btn.dataset.id).delete();
            loadProducts();
          }
        });
      });

      tbody.querySelectorAll('.supply').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('supply-product-id').value = btn.dataset.id;
          document.getElementById('supply-product-name').textContent = btn.dataset.name;
          document.getElementById('supply-current-stock').textContent = btn.dataset.stock;
          document.getElementById('supply-qty').value = '';
          supplyModal.style.display = 'flex';
        });
      });

    } catch (err) {
      tbody.innerHTML = '<p>Ошибка загрузки: ' + err.message + '</p>';
    }
  }

  function editProduct(product) {
    document.getElementById('modal-title').textContent = 'Редактировать товар';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-title').value = product.title;
    document.getElementById('product-description').value = product.description;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-stock').value = product.stock;
    document.getElementById('product-image').value = product.image;

    if (product.badge) {
      document.getElementById('product-has-badge').checked = true;
      document.getElementById('badge-settings').style.display = 'block';
      document.getElementById('badge-text').value = product.badge.text;
      document.getElementById('badge-bg').value = product.badge.bgColor;
      document.getElementById('badge-color').value = product.badge.color;
    } else {
      document.getElementById('product-has-badge').checked = false;
      document.getElementById('badge-settings').style.display = 'none';
    }

    productModal.style.display = 'flex';
  }

  // Загрузка заказов
  async function loadOrders() {
    const container = document.getElementById('orders-list');
    container.innerHTML = '<p>Загрузка заказов...</p>';

    try {
      const snapshot = await db.collection('orders')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const orders = [];
      snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));

      if (orders.length === 0) {
        container.innerHTML = '<p>Заказов пока нет.</p>';
        return;
      }

      container.innerHTML = orders.map(order => {
        const items = order.items || [];
        const itemsHtml = items.map(item =>
          `<li>${item.title} x${item.qty} — ${item.price * item.qty} ₽</li>`
        ).join('');

        const date = order.createdAt
          ? new Date(order.createdAt.seconds * 1000).toLocaleString('ru-RU')
          : '—';

        return `
          <div class="order-card">
            <h3>Заказ №${order.orderNumber || order.id}</h3>
            <p><strong>Дата:</strong> ${date}</p>
            <p><strong>Статус:</strong> ${order.status}</p>
            <p><strong>Сумма:</strong> ${order.amount} ${order.currency}</p>
            <p><strong>Чек:</strong> ${order.paymentId}</p>
            <p><strong>Покупатель:</strong> ${order.customerName}</p>
            <p><strong>Телефон:</strong> ${order.customerPhone}</p>
            <p><strong>Email:</strong> ${order.customerEmail || '—'}</p>
            <p><strong>Адрес:</strong> ${order.deliveryAddress}</p>
            <ul>${itemsHtml}</ul>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = '<p>Ошибка загрузки заказов: ' + err.message + '</p>';
    }
  }
});