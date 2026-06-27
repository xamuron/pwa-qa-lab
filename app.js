const APP_VERSION = '1.2.3';
const API_BASE = 'https://dummyjson.com';
const DB_NAME = 'qa-pwa-lab';
const DB_VERSION = 1;

const state = {
  products: [],
  cart: [],
  orders: [],
  auth: null,
  deferredInstallPrompt: null,
  refreshing: false,
  swRegistration: null
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  appVersion: $('#appVersion'),
  homeBtn: $('#homeBtn'),
  networkStatus: $('#networkStatus'),
  profileBtn: $('#profileBtn'),
  profileInitials: $('#profileInitials'),
  swStatus: $('#swStatus'),
  productsGrid: $('#productsGrid'),
  catalogHint: $('#catalogHint'),
  searchInput: $('#searchInput'),
  refreshProductsBtn: $('#refreshProductsBtn'),
  cartCount: $('#cartCount'),
  queueCount: $('#queueCount'),
  cartList: $('#cartList'),
  ordersList: $('#ordersList'),
  createOrderBtn: $('#createOrderBtn'),
  syncNowBtn: $('#syncNowBtn'),
  accountSummary: $('#accountSummary'),
  loginForm: $('#loginForm'),
  usernameInput: $('#usernameInput'),
  passwordInput: $('#passwordInput'),
  togglePasswordBtn: $('#togglePasswordBtn'),
  loginBtn: $('#loginBtn'),
  loginHint: $('#loginHint'),
  logoutBtn: $('#logoutBtn'),
  profileNotificationStatus: $('#profileNotificationStatus'),
  profileRequestNotificationsBtn: $('#profileRequestNotificationsBtn'),
  profileResetNotificationsBtn: $('#profileResetNotificationsBtn'),
  updatePrompt: $('#updatePrompt'),
  applyUpdateBtn: $('#applyUpdateBtn'),
  applyWaitingWorkerBtn: $('#applyWaitingWorkerBtn'),
  checkUpdateBtn: $('#checkUpdateBtn'),
  installBtn: $('#installBtn'),
  requestNotificationsBtn: $('#requestNotificationsBtn'),
  testNotificationBtn: $('#testNotificationBtn'),
  clearCacheBtn: $('#clearCacheBtn'),
  clearIdbBtn: $('#clearIdbBtn'),
  offlineOrderBanner: $('#offlineOrderBanner'),
  toast: $('#toast'),
  diagNetwork: $('#diagNetwork'),
  diagSw: $('#diagSw'),
  diagSwActive: $('#diagSwActive'),
  diagSwWaiting: $('#diagSwWaiting'),
  diagSwInstalling: $('#diagSwInstalling'),
  diagNotifications: $('#diagNotifications'),
  diagAuth: $('#diagAuth'),
  diagInstall: $('#diagInstall'),
  diagProducts: $('#diagProducts'),
  diagQueue: $('#diagQueue'),
  diagCaches: $('#diagCaches'),
  diagLastSync: $('#diagLastSync')
};

elements.appVersion.textContent = APP_VERSION;

let dbPromise;
const trackedServiceWorkers = new WeakSet();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cart')) {
        db.createObjectStore('cart', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function tx(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putMany(storeName, items) {
  await tx(storeName, 'readwrite', (store) => {
    items.forEach((item) => store.put(item));
  });
}

async function putOne(storeName, item) {
  await tx(storeName, 'readwrite', (store) => store.put(item));
}

async function deleteOne(storeName, id) {
  await tx(storeName, 'readwrite', (store) => store.delete(id));
}

async function clearStore(storeName) {
  await tx(storeName, 'readwrite', (store) => store.clear());
}

async function getSetting(key, fallback = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result?.value ?? fallback);
    request.onerror = () => reject(request.error);
  });
}

async function setSetting(key, value) {
  await putOne('settings', { key, value });
}

async function deleteSetting(key) {
  await deleteOne('settings', key);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  window.setTimeout(() => elements.toast.classList.remove('visible'), 3000);
}

function showOfflineOrderBanner() {
  elements.offlineOrderBanner.classList.remove('hidden');
  window.setTimeout(() => elements.offlineOrderBanner.classList.add('hidden'), 5000);
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  elements.networkStatus.textContent = online ? 'Online' : 'Offline';
  elements.networkStatus.classList.toggle('offline', !online);
  elements.diagNetwork.textContent = online ? 'online' : 'offline';
  elements.loginBtn.disabled = !online || Boolean(state.auth);
  elements.loginHint.textContent = online
    ? 'Demo credentials: emilys / emilyspass. Логин доступен только с сетью.'
    : 'Сейчас offline: войти не получится, но локальные данные доступны.';
}

async function loadInitialData() {
  state.cart = await getAll('cart');
  state.orders = await getAll('orders');
  state.products = await getAll('products');
  state.auth = await getSetting('auth');
  renderAll();

  if (state.products.length === 0 || navigator.onLine) {
    await refreshProducts();
  }
}

async function refreshProducts() {
  elements.refreshProductsBtn.disabled = true;
  elements.catalogHint.textContent = 'Загружаем каталог из DummyJSON...';

  try {
    const response = await fetch(`${API_BASE}/products?limit=24`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.products = data.products;
    await clearStore('products');
    await putMany('products', state.products);
    elements.catalogHint.textContent = 'Каталог обновлен из сети и сохранен в IndexedDB.';
  } catch (error) {
    state.products = await getAll('products');
    elements.catalogHint.textContent = state.products.length
      ? 'Сеть недоступна. Показываем каталог из IndexedDB.'
      : 'Каталог еще не закеширован. Подключите сеть и обновите данные.';
  } finally {
    elements.refreshProductsBtn.disabled = false;
    renderProducts();
    updateDiagnostics();
  }
}

function renderProducts() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const products = state.products.filter((product) => {
    const haystack = `${product.title} ${product.brand} ${product.category}`.toLowerCase();
    return haystack.includes(query);
  });

  if (products.length === 0) {
    elements.productsGrid.innerHTML = '<div class="empty">Товаров пока нет. Проверьте сеть или очистку хранилища.</div>';
    return;
  }

  elements.productsGrid.innerHTML = products.map((product) => {
    const cartItem = state.cart.find((item) => item.id === product.id);

    return `
      <article class="product-card">
        <img src="${product.thumbnail}" alt="${escapeHtml(product.title)}" loading="lazy">
        <div class="product-body">
          <h3 class="product-title">${escapeHtml(product.title)}</h3>
          <div class="meta-row">
            <span>${escapeHtml(product.category)}</span>
            <span class="price">${formatMoney(product.price)}</span>
          </div>
          ${cartItem ? `
            <div class="catalog-quantity" aria-label="Количество товара в корзине">
              <button class="quantity-btn" data-decrease="${product.id}" aria-label="Уменьшить количество ${escapeHtml(product.title)}">-</button>
              <span class="catalog-quantity-value">
                <strong>${cartItem.quantity}</strong>
                <small>в корзине</small>
              </span>
              <button class="quantity-btn" data-increase="${product.id}" aria-label="Увеличить количество ${escapeHtml(product.title)}">+</button>
            </div>
          ` : `<button class="primary" data-add-to-cart="${product.id}">В корзину</button>`}
        </div>
      </article>
    `;
  }).join('');
}

function renderCart() {
  elements.cartCount.textContent = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  if (state.cart.length === 0) {
    elements.cartList.innerHTML = '<div class="empty">Корзина пуста. Добавьте товары из каталога.</div>';
    elements.createOrderBtn.disabled = true;
    return;
  }

  elements.createOrderBtn.disabled = false;
  elements.cartList.innerHTML = state.cart.map((item) => `
    <article class="list-item">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${formatMoney(item.price)} · subtotal ${formatMoney(item.price * item.quantity)}</p>
      </div>
      <div class="item-actions">
        <button class="secondary" data-decrease="${item.id}" aria-label="Уменьшить количество">-</button>
        <span class="quantity">${item.quantity}</span>
        <button class="secondary" data-increase="${item.id}" aria-label="Увеличить количество">+</button>
        <button class="danger" data-remove="${item.id}">Удалить</button>
      </div>
    </article>
  `).join('');
}

function renderAccount() {
  const loggedIn = Boolean(state.auth);
  const notificationPermission = 'Notification' in window ? Notification.permission : 'unsupported';
  elements.profileBtn.classList.toggle('guest', !loggedIn);
  elements.profileBtn.title = loggedIn ? `Аккаунт: ${state.auth.user.username}` : 'Аккаунт гостя';
  elements.profileBtn.setAttribute('aria-label', loggedIn ? `Открыть аккаунт ${state.auth.user.username}` : 'Открыть аккаунт гостя');
  elements.profileInitials.textContent = loggedIn
    ? `${state.auth.user.firstName?.[0] || ''}${state.auth.user.lastName?.[0] || ''}`.toUpperCase()
    : 'G';
  elements.loginForm.hidden = loggedIn;
  elements.loginForm.classList.toggle('hidden', loggedIn);
  elements.logoutBtn.hidden = !loggedIn;
  elements.loginBtn.disabled = !navigator.onLine || loggedIn;
  elements.profileNotificationStatus.textContent = notificationPermission;
  elements.profileRequestNotificationsBtn.disabled = notificationPermission !== 'default';
  elements.profileResetNotificationsBtn.disabled = notificationPermission === 'unsupported';

  if (!loggedIn) {
    elements.accountSummary.innerHTML = `
      <strong>Гость</strong>
      <span class="hint">Можно собирать корзину, но для оформления заказа нужно войти.</span>
    `;
    return;
  }

  elements.accountSummary.innerHTML = `
    <strong>${escapeHtml(state.auth.user.firstName)} ${escapeHtml(state.auth.user.lastName)}</strong>
    <span class="hint">@${escapeHtml(state.auth.user.username)} · ${escapeHtml(state.auth.user.email)}</span>
  `;
}

function renderOrders() {
  elements.queueCount.textContent = state.orders.filter((order) => ['pending', 'syncing', 'failed'].includes(order.status)).length;

  if (state.orders.length === 0) {
    elements.ordersList.innerHTML = '<div class="empty">Очередь пуста. Создайте заказ онлайн или оффлайн.</div>';
    return;
  }

  elements.ordersList.innerHTML = state.orders
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => `
      <article class="list-item">
        <div>
          <h3>${order.id}</h3>
          <p>${order.items.length} items · ${formatMoney(order.total)} · ${new Date(order.createdAt).toLocaleString()}</p>
          <p>Status: <strong>${order.status}</strong>${order.error ? ` · ${escapeHtml(order.error)}` : ''}</p>
        </div>
        <div class="item-actions">
          ${order.status === 'failed' || order.status === 'pending' ? `<button class="secondary" data-retry="${order.id}">Retry</button>` : ''}
          ${order.status === 'pending' ? `<button class="danger" data-cancel="${order.id}">Cancel</button>` : ''}
        </div>
      </article>
    `).join('');
}

async function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  const existing = state.cart.find((item) => item.id === productId);

  if (existing) {
    existing.quantity += 1;
    await putOne('cart', existing);
  } else if (product) {
    const cartItem = {
      id: product.id,
      title: product.title,
      price: product.price,
      quantity: 1
    };
    state.cart.push(cartItem);
    await putOne('cart', cartItem);
  }

  renderCart();
  renderProducts();
  updateDiagnostics();
  showToast('Товар добавлен в корзину');
}

async function changeQuantity(productId, delta) {
  const item = state.cart.find((entry) => entry.id === productId);
  if (!item) {
    return;
  }
  item.quantity += delta;

  if (item.quantity <= 0) {
    await removeFromCart(productId);
    return;
  }

  await putOne('cart', item);
  renderCart();
  renderProducts();
}

async function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.id !== productId);
  await deleteOne('cart', productId);
  renderCart();
  renderProducts();
  updateDiagnostics();
}

async function createOrder() {
  if (state.cart.length === 0) {
    return;
  }

  if (!state.auth) {
    showToast('Войдите в аккаунт, чтобы оформить заказ');
    showView('account');
    return;
  }

  const order = {
    id: `local-order-${Date.now()}`,
    type: 'CREATE_ORDER',
    status: navigator.onLine ? 'syncing' : 'pending',
    createdAt: new Date().toISOString(),
    userId: state.auth.user.id,
    items: state.cart.map((item) => ({ productId: item.id, title: item.title, price: item.price, quantity: item.quantity })),
    total: state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    serverResponse: null,
    error: null
  };

  state.orders.push(order);
  await putOne('orders', order);
  await clearStore('cart');
  state.cart = [];
  renderAll();
  await notify('Заказ создан', navigator.onLine ? 'Отправляем заказ в DummyJSON.' : 'Заказ сохранен в offline-очередь.');

  if (navigator.onLine) {
    await syncOrders();
  } else {
    showOfflineOrderBanner();
  }
}

async function syncOrders() {
  const pending = state.orders.filter((order) => ['pending', 'failed', 'syncing'].includes(order.status));
  if (pending.length === 0) {
    showToast('Нет заказов для синхронизации');
    return;
  }

  if (!navigator.onLine) {
    showToast('Синхронизация невозможна без сети');
    return;
  }

  if (!state.auth) {
    showToast('Войдите в аккаунт для синхронизации заказов');
    showView('account');
    return;
  }

  for (const order of pending) {
    order.status = 'syncing';
    order.error = null;
    await putOne('orders', order);
    renderOrders();

    try {
      const response = await fetch(`${API_BASE}/carts/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.auth.accessToken}`
        },
        body: JSON.stringify({
          userId: state.auth.user.id,
          products: order.items.map((item) => ({ id: item.productId, quantity: item.quantity }))
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      order.status = 'synced';
      order.serverResponse = await response.json();
    } catch (error) {
      order.status = 'failed';
      order.error = error.message;
    }

    await putOne('orders', order);
  }

  await setSetting('lastSync', new Date().toISOString());
  renderAll();
  updateDiagnostics();
  await notify('Синхронизация завершена', 'Проверьте статусы заказов в очереди.');
}

async function notify(title, body) {
  if (!('Notification' in window)) {
    console.info('[notifications] skipped: Notifications API is unsupported');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.info(`[notifications] skipped: permission is ${Notification.permission}`);
    return;
  }

  try {
    if (state.swRegistration?.showNotification) {
      await state.swRegistration.showNotification(title, {
        body,
        icon: './icons/icon.svg',
        badge: './icons/icon.svg'
      });
      return;
    }

    new Notification(title, { body, icon: './icons/icon.svg' });
  } catch (error) {
    console.error('[notifications] show failed', error);
  }
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    showToast('Notifications API не поддерживается этим браузером');
    return;
  }

  const permission = await Notification.requestPermission();
  showToast(`Notification permission: ${permission}`);
  renderAccount();
  updateDiagnostics();
}

function explainNotificationReset() {
  if (!('Notification' in window)) {
    showToast('Notifications API не поддерживается этим браузером');
    return;
  }

  window.alert('JavaScript не может сам снять разрешение на уведомления. Чтобы убрать разрешение: откройте настройки сайта в браузере и измените Notifications на Block или Reset.');
}

async function testNotification() {
  if (!('Notification' in window)) {
    console.info('[notifications] test skipped: Notifications API is unsupported');
    return;
  }

  if (Notification.permission === 'default') {
    await requestNotifications();
  }

  await delay(2500);
  await notify('QA PWA Lab', 'Тестовое уведомление из dev-раздела.');
  renderAccount();
  updateDiagnostics();
}

async function login(event) {
  event.preventDefault();

  if (!navigator.onLine) {
    showToast('Логин доступен только с сетью');
    return;
  }

  elements.loginBtn.disabled = true;
  elements.loginBtn.textContent = 'Входим...';

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: elements.usernameInput.value.trim(),
        password: elements.passwordInput.value,
        expiresInMins: 30
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    state.auth = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      loginAt: new Date().toISOString(),
      user: {
        id: data.id,
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        image: data.image
      }
    };
    await setSetting('auth', state.auth);
    renderAll();
    showView('catalog');
    showToast(`Вход выполнен: ${state.auth.user.username}`);
  } catch (error) {
    showToast(`Не удалось войти: ${error.message}`);
  } finally {
    elements.loginBtn.textContent = 'Войти';
    elements.loginBtn.disabled = !navigator.onLine || Boolean(state.auth);
  }
}

async function logout() {
  const unsyncedOrders = state.orders.filter((order) => ['pending', 'syncing', 'failed'].includes(order.status));

  if (unsyncedOrders.length > 0) {
    const confirmed = window.confirm(`В очереди есть неотправленные заказы: ${unsyncedOrders.length}. При выходе они будут сброшены. Выйти?`);
    if (!confirmed) {
      return;
    }
  }

  for (const order of unsyncedOrders) {
    await deleteOne('orders', order.id);
  }

  state.orders = state.orders.filter((order) => !['pending', 'syncing', 'failed'].includes(order.status));
  state.auth = null;
  await deleteSetting('auth');
  renderAll();
  showView('catalog');
  showToast('Вы вышли из аккаунта');
}

function renderAll() {
  renderProducts();
  renderCart();
  renderAccount();
  renderOrders();
  updateDiagnostics();
}

async function updateDiagnostics() {
  const registration = state.swRegistration || await navigator.serviceWorker?.getRegistration?.();
  const hasActive = Boolean(registration?.active);
  const hasWaiting = Boolean(registration?.waiting);
  const hasInstalling = Boolean(registration?.installing);

  elements.diagNetwork.textContent = navigator.onLine ? 'online' : 'offline';
  elements.diagSw.textContent = navigator.serviceWorker?.controller ? 'controlled' : 'not controlled';
  elements.diagSwActive.textContent = hasActive ? 'yes' : 'no';
  elements.diagSwWaiting.textContent = hasWaiting ? 'yes' : 'no';
  elements.diagSwInstalling.textContent = hasInstalling ? 'yes' : 'no';
  elements.applyWaitingWorkerBtn.disabled = !hasWaiting;
  elements.diagNotifications.textContent = 'Notification' in window ? Notification.permission : 'unsupported';
  elements.diagAuth.textContent = state.auth ? state.auth.user.username : 'guest';
  elements.diagInstall.textContent = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
  elements.diagProducts.textContent = String(state.products.length);
  elements.diagQueue.textContent = String(state.orders.filter((order) => ['pending', 'syncing', 'failed'].includes(order.status)).length);
  elements.diagLastSync.textContent = await getSetting('lastSync', 'never');

  if ('caches' in window) {
    elements.diagCaches.textContent = String((await caches.keys()).length);
  } else {
    elements.diagCaches.textContent = 'unsupported';
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    elements.swStatus.textContent = 'SW: unsupported';
    elements.diagSw.textContent = 'unsupported';
    return;
  }

  state.swRegistration = await navigator.serviceWorker.register('./sw.js');
  elements.swStatus.textContent = navigator.serviceWorker.controller ? 'SW: active' : 'SW: registered';
  await updateDiagnostics();
  trackServiceWorkerUpdate(state.swRegistration);

  state.swRegistration.addEventListener('updatefound', () => {
    trackServiceWorkerUpdate(state.swRegistration);
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (state.refreshing) {
      return;
    }
    state.refreshing = true;
    window.location.reload();
  });
}

function trackServiceWorkerUpdate(registration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateBanner();
  }

  const worker = registration.installing;
  if (!worker || trackedServiceWorkers.has(worker)) {
    updateDiagnostics();
    return;
  }

  trackedServiceWorkers.add(worker);
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showUpdateBanner();
    }
    updateDiagnostics();
  });
}

function showUpdateBanner() {
  elements.updatePrompt.classList.remove('hidden');
  updateDiagnostics();
}

async function applyUpdate() {
  const registration = state.swRegistration || await navigator.serviceWorker.getRegistration();
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

async function clearCaches() {
  if (!('caches' in window)) {
    return;
  }
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
  await updateDiagnostics();
  showToast('Cache Storage очищен');
}

async function clearIndexedDb() {
  await Promise.all(['products', 'cart', 'orders', 'settings'].map(clearStore));
  state.products = [];
  state.cart = [];
  state.orders = [];
  state.auth = null;
  renderAll();
  showToast('IndexedDB очищена');
}

function showView(viewName) {
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  $(`#${viewName}View`).classList.add('active');
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      showView(tab.dataset.view);
      history.replaceState(null, '', tab.dataset.view === 'catalog' ? './index.html' : `#${tab.dataset.view}`);
    });
  });
}

function openInitialViewFromHash() {
  const viewName = window.location.hash.replace('#', '');
  if (viewName && document.querySelector(`#${viewName}View`)) {
    showView(viewName);
  }
}

function setupEvents() {
  elements.productsGrid.addEventListener('click', (event) => {
    const addId = Number(event.target.dataset.addToCart);
    const increaseId = Number(event.target.dataset.increase);
    const decreaseId = Number(event.target.dataset.decrease);

    if (addId) {
      addToCart(addId);
    }
    if (increaseId) {
      changeQuantity(increaseId, 1);
    }
    if (decreaseId) {
      changeQuantity(decreaseId, -1);
    }
  });

  elements.cartList.addEventListener('click', (event) => {
    const target = event.target;
    if (target.dataset.increase) changeQuantity(Number(target.dataset.increase), 1);
    if (target.dataset.decrease) changeQuantity(Number(target.dataset.decrease), -1);
    if (target.dataset.remove) removeFromCart(Number(target.dataset.remove));
  });

  elements.ordersList.addEventListener('click', async (event) => {
    const retryId = event.target.dataset.retry;
    const cancelId = event.target.dataset.cancel;
    if (retryId) {
      const order = state.orders.find((item) => item.id === retryId);
      if (order) order.status = 'pending';
      await syncOrders();
    }
    if (cancelId) {
      state.orders = state.orders.filter((order) => order.id !== cancelId);
      await deleteOne('orders', cancelId);
      renderAll();
    }
  });

  elements.searchInput.addEventListener('input', renderProducts);
  elements.homeBtn.addEventListener('click', () => showView('catalog'));
  elements.refreshProductsBtn.addEventListener('click', refreshProducts);
  elements.createOrderBtn.addEventListener('click', createOrder);
  elements.syncNowBtn.addEventListener('click', syncOrders);
  elements.profileBtn.addEventListener('click', () => showView('account'));
  elements.loginForm.addEventListener('submit', login);
  elements.logoutBtn.addEventListener('click', logout);
  elements.togglePasswordBtn.addEventListener('click', () => {
    const showPassword = elements.passwordInput.type === 'password';
    elements.passwordInput.type = showPassword ? 'text' : 'password';
    elements.togglePasswordBtn.setAttribute('aria-label', showPassword ? 'Скрыть пароль' : 'Показать пароль');
    elements.togglePasswordBtn.title = showPassword ? 'Скрыть пароль' : 'Показать пароль';
  });
  elements.requestNotificationsBtn.addEventListener('click', requestNotifications);
  elements.testNotificationBtn.addEventListener('click', testNotification);
  elements.profileRequestNotificationsBtn.addEventListener('click', requestNotifications);
  elements.profileResetNotificationsBtn.addEventListener('click', explainNotificationReset);
  elements.clearCacheBtn.addEventListener('click', clearCaches);
  elements.clearIdbBtn.addEventListener('click', clearIndexedDb);
  elements.applyUpdateBtn.addEventListener('click', applyUpdate);
  elements.applyWaitingWorkerBtn.addEventListener('click', applyUpdate);
  elements.checkUpdateBtn.addEventListener('click', async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    if (registration) {
      trackServiceWorkerUpdate(registration);
      window.setTimeout(() => trackServiceWorkerUpdate(registration), 500);
    }
    await updateDiagnostics();
    showToast('Проверка обновления запущена');
  });

  window.addEventListener('online', async () => {
    updateNetworkStatus();
    showToast('Сеть восстановлена');
    await syncOrders();
  });
  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('focus', renderAccount);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderAccount();
      updateDiagnostics();
    }
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installBtn.hidden = false;
    updateDiagnostics();
  });

  elements.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) {
      return;
    }
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    elements.installBtn.hidden = true;
    updateDiagnostics();
  });

  window.addEventListener('appinstalled', () => {
    elements.installBtn.hidden = true;
    state.deferredInstallPrompt = null;
    updateDiagnostics();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

setupTabs();
setupEvents();
openInitialViewFromHash();
updateNetworkStatus();
await registerServiceWorker();
await loadInitialData();
