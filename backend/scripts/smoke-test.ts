/* eslint-disable no-console */
/**
 * Смоук-тест REST API магазина RESELL.
 *
 * Проходит основные пользовательские сценарии:
 *   регистрация → вход → каталог → карточка товара → корзина → промокод →
 *   заказ → статусы → избранное → отзыв → админ-панель (статистика, прибыль)
 *   и проверяет, что финансовая информация не утекает в клиентский API.
 *
 * Запуск:  npm run smoke   (сервер должен быть запущен на BASE_URL)
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ❌ ${name}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 400) : '');
  }
}

async function api<T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nСмоук-тест API: ${BASE_URL}\n`);

  // --- health ---
  const health = await api('GET', '/api/health');
  check('GET /api/health отвечает ok', health.status === 200 && (health.data as any).status === 'ok');

  // --- регистрация ---
  const email = `smoke+${Date.now()}@resell.test`;
  const password = 'test1234';
  const reg = await api('POST', '/api/auth/register', {
    body: { email, password, firstName: 'Смок', lastName: 'Тест', phone: '+7 900 000-00-00' },
  });
  check('POST /api/auth/register создаёт пользователя', reg.status === 201 && Boolean(reg.data.token));
  const token: string = reg.data.token;

  const dup = await api('POST', '/api/auth/register', { body: { email, password, firstName: 'Дубль' } });
  check('Регистрация с занятым e-mail отклоняется (409)', dup.status === 409);

  const badReg = await api('POST', '/api/auth/register', { body: { email: 'не почта', password: '123' } });
  check('Валидация регистрации отклоняет плохие данные (400)', badReg.status === 400);

  // --- вход ---
  const login = await api('POST', '/api/auth/login', { body: { email, password } });
  check('POST /api/auth/login выдаёт токен', login.status === 200 && Boolean(login.data.token));

  const wrongLogin = await api('POST', '/api/auth/login', { body: { email, password: 'wrongpass' } });
  check('Вход с неверным паролем отклоняется (401)', wrongLogin.status === 401);

  const me = await api('GET', '/api/auth/me', { token });
  check('GET /api/auth/me возвращает профиль', me.status === 200 && me.data.user.email === email);

  const meNoToken = await api('GET', '/api/auth/me');
  check('GET /api/auth/me без токена → 401', meNoToken.status === 401);

  // --- каталог ---
  const categories = await api('GET', '/api/categories');
  check('GET /api/categories возвращает 10 категорий', categories.status === 200 && categories.data.items.length === 10);
  const firstCategoryId: number = categories.data.items[0].id;

  const products = await api('GET', '/api/products?limit=5&sort=newest');
  check('GET /api/products возвращает список + пагинацию', products.status === 200 && Array.isArray(products.data.items) && products.data.pagination.total > 0);
  check('В публичном списке нет финансовых полей', !JSON.stringify(products.data.items[0]).includes('purchasePrice'));

  const search = await api('GET', '/api/products?q=худи');
  check('Поиск «худи» находит товары', search.status === 200 && search.data.items.length > 0);

  const facets = await api('GET', '/api/products/facets');
  check('GET /api/products/facets отдаёт размеры и цвета', facets.status === 200 && facets.data.sizes.length > 0 && facets.data.colors.length > 0);

  const filtered = await api('GET', '/api/products?sort=price_asc&limit=50');
  const prices = filtered.data.items.map((p: any) => p.priceCents);
  check('Сортировка по цене работает', prices.every((v: number, i: number) => i === 0 || v >= prices[i - 1]));

  const productId = products.data.items[0].id;
  const card = await api('GET', `/api/products/${productId}`);
  check('GET /api/products/:id возвращает карточку с вариациями', card.status === 200 && card.data.variants.length > 0);
  check('В карточке товара нет закупочной цены', !JSON.stringify(card.data).match(/purchasePrice|costCents|finance/));

  const variant = card.data.variants.find((v: any) => v.stock > 0) ?? card.data.variants[0];

  // --- корзина ---
  const cartEmpty = await api('GET', '/api/cart', { token });
  check('GET /api/cart у нового пользователя пуст', cartEmpty.status === 200 && cartEmpty.data.items.length === 0);

  const addCart = await api('POST', '/api/cart', { token, body: { variantId: variant.id, quantity: 1 } });
  check('POST /api/cart добавляет товар', addCart.status === 201 && addCart.data.items.length === 1);

  const addAgain = await api('POST', '/api/cart', { token, body: { variantId: variant.id, quantity: 1 } });
  check(
    'Повторное добавление увеличивает количество',
    (addAgain.status === 200 || addAgain.status === 201) && addAgain.data.items[0].quantity === 2,
    { status: addAgain.status, body: addAgain.data },
  );

  const cartItemId = addAgain.data.items[0].id;
  const upd = await api('PUT', `/api/cart/${cartItemId}`, { token, body: { quantity: 1 } });
  check('PUT /api/cart/:id меняет количество', upd.status === 200 && upd.data.items[0].quantity === 1);

  const overStock = await api('PUT', `/api/cart/${cartItemId}`, { token, body: { quantity: 9999 } });
  check('Количество больше остатка отклоняется (400)', overStock.status === 400);

  const cartNoAuth = await api('GET', '/api/cart');
  check('Корзина без токена → 401', cartNoAuth.status === 401);

  // Доставка: бесплатно от 5 000 ₽, иначе 490 ₽ за курьера
  const previewPlain = await api('GET', '/api/orders/checkout-preview?deliveryMethod=courier', { token });
  const expectFree = previewPlain.data.itemsTotalCents >= 500_000;
  check(
    expectFree ? 'Курьер бесплатный при заказе от 5 000 ₽' : 'Курьер стоит 490 ₽ при заказе до 5 000 ₽',
    previewPlain.status === 200 && previewPlain.data.deliveryCost === (expectFree ? 0 : 490),
    previewPlain.data,
  );

  // На пустой корзине проверяем тариф доставки напрямую
  await api('DELETE', '/api/cart', { token });
  const cheap = await api('GET', '/api/products?sort=price_asc&limit=1');
  const cheapCard = await api('GET', `/api/products/${cheap.data.items[0].id}`);
  const cheapVariant = cheapCard.data.variants.find((v: any) => v.stock > 0);
  const cart2 = await api('POST', '/api/cart', { token, body: { variantId: cheapVariant.id, quantity: 1 } });
  const previewCheap = await api('GET', '/api/orders/checkout-preview?deliveryMethod=courier', { token });
  check(
    'Дешёвый заказ: курьер 490 ₽, пункт выдачи бесплатно',
    cart2.status === 201 &&
      previewCheap.data.itemsTotalCents < 500_000 &&
      previewCheap.data.deliveryCost === 490,
    { itemsTotal: previewCheap.data.itemsTotal, delivery: previewCheap.data.deliveryCost },
  );
  const previewPickup = await api('GET', '/api/orders/checkout-preview?deliveryMethod=pickup', { token });
  check('Пункт выдачи всегда бесплатный', previewPickup.data.deliveryCost === 0);


  // --- промокод ---
  const preview = await api('GET', '/api/orders/checkout-preview?deliveryMethod=courier&promocode=RESELL10', { token });
  check('checkout-preview считает доставку и скидку', preview.status === 200 && preview.data.discount > 0);

  const badPromo = await api('GET', '/api/orders/checkout-preview?promocode=НЕТУ', { token });
  check('Неверный промокод даёт ошибку в preview', badPromo.status === 200 && Boolean(badPromo.data.promocodeError));

  // --- заказ ---
  const order = await api('POST', '/api/orders', {
    token,
    body: {
      customerName: 'Смок Тест',
      phone: '+7 900 000-00-00',
      city: 'Челябинск',
      deliveryMethod: 'pickup',
      pickupPoint: 'Челябинск, ул. Кирова, 159 (СДЭК)',
      promocode: 'RESELL10',
    },
  });
  check('POST /api/orders создаёт заказ', order.status === 201 && Boolean(order.data.number));
  check('Заказ не содержит финансовых полей', !JSON.stringify(order.data).includes('unitCost') && !JSON.stringify(order.data).includes('finance'));
  const orderId = order.data.id;

  const cartAfter = await api('GET', '/api/cart', { token });
  check('После заказа корзина очищена', cartAfter.status === 200 && cartAfter.data.items.length === 0);

  const orders = await api('GET', '/api/orders', { token });
  check('GET /api/orders возвращает историю', orders.status === 200 && orders.data.items.length === 1);

  const pay = await api('PUT', `/api/orders/${orderId}/status`, { token, body: { status: 'paid' } });
  check('Покупатель может оплатить заказ (pending → paid)', pay.status === 200 && pay.data.status === 'paid');

  const badTransition = await api('PUT', `/api/orders/${orderId}/status`, { token, body: { status: 'delivered' } });
  check('Недопустимый переход статуса отклоняется (400)', badTransition.status === 400);

  // --- избранное ---
  const fav = await api('POST', '/api/favorites', { token, body: { productId } });
  check('POST /api/favorites добавляет в избранное', fav.status === 201 && fav.data.favorite === true);
  const favList = await api('GET', '/api/favorites', { token });
  check('GET /api/favorites возвращает товар', favList.status === 200 && favList.data.items.length === 1);
  const unfav = await api('DELETE', `/api/favorites/${productId}`, { token });
  check('DELETE /api/favorites/:productId убирает из избранного', unfav.status === 200 && unfav.data.favorite === false);

  // --- отзыв (доступен только после покупки) ---
  const boughtId: number = order.data.items[0].productId;
  const notBought = await api('GET', '/api/products?limit=50');
  const notBoughtId: number =
    notBought.data.items.find((p: any) => p.id !== boughtId)?.id ?? boughtId + 1;

  const reviewForbidden = await api('POST', '/api/reviews', {
    token,
    body: { productId: notBoughtId, rating: 5, body: 'Хочу оставить отзыв без покупки' },
  });
  check('Отзыв на некупленный товар отклоняется (403)', reviewForbidden.status === 403, reviewForbidden.data);

  const review = await api('POST', '/api/reviews', {
    token,
    body: { productId: boughtId, rating: 5, title: 'Отлично', body: 'Качество супер' },
  });
  check('Отзыв на купленный товар создаётся (201)', review.status === 201, review.data);

  const reviewDup = await api('POST', '/api/reviews', { token, body: { productId: boughtId, rating: 4 } });
  check('Второй отзыв на тот же товар отклоняется (409)', reviewDup.status === 409);

  const productReviews = await api('GET', `/api/products/${boughtId}/reviews`);
  check('GET /api/products/:id/reviews отдаёт отзывы', productReviews.status === 200 && productReviews.data.count >= 1);

  // --- RBAC: обычный пользователь не имеет доступа к админке ---
  const adminForbidden = await api('GET', '/api/admin/statistics', { token });
  check('GET /api/admin/statistics для покупателя → 403', adminForbidden.status === 403);
  const adminNoAuth = await api('GET', '/api/admin/orders');
  check('GET /api/admin/orders без токена → 401', adminNoAuth.status === 401);

  // --- админ ---
  const adminLogin = await api('POST', '/api/auth/login', { body: { email: 'admin@resell.ru', password: 'admin123' } });
  check('Вход администратора', adminLogin.status === 200 && adminLogin.data.user.role === 'ADMIN');
  const adminToken: string = adminLogin.data.token;

  const stats = await api('GET', '/api/admin/statistics', { token: adminToken });
  check(
    'GET /api/admin/statistics считает выручку, себестоимость и прибыль',
    stats.status === 200 && stats.data.finance.revenue > 0 && stats.data.finance.profit !== undefined,
  );
  check('Статистика содержит топ продаж и низкие остатки', Array.isArray(stats.data.bestSellers) && stats.data.lowStock.variants !== undefined);

  const profit = await api('GET', '/api/admin/profit', { token: adminToken });
  check(
    'GET /api/admin/profit считает маржинальность по товарам',
    profit.status === 200 && profit.data.items.length > 0 && typeof profit.data.items[0].margin === 'number',
  );
  check(
    'Формула прибыли соблюдается (прибыль = цена − себестоимость)',
    Math.abs(profit.data.items[0].price - profit.data.items[0].cost - profit.data.items[0].profit) < 0.02,
    { sample: profit.data.items[0] },
  );

  const adminOrders = await api('GET', '/api/admin/orders', { token: adminToken });
  check('GET /api/admin/orders содержит финансовый блок', adminOrders.status === 200 && adminOrders.data.items[0].finance !== undefined);

  const adminUsers = await api('GET', '/api/admin/users', { token: adminToken });
  check('GET /api/admin/users возвращает пользователей', adminUsers.status === 200 && adminUsers.data.items.length >= 7);

  const statusFlow = await api('PUT', `/api/admin/orders/${orderId}/status`, { token: adminToken, body: { status: 'processing' } });
  check('Админ меняет статус заказа (paid → processing)', statusFlow.status === 200 && statusFlow.data.status === 'processing');

  // создание товара админом
  const newProduct = await api('POST', '/api/admin/products', {
    token: adminToken,
    body: {
      name: 'Смоук-тест футболка',
      categoryId: firstCategoryId,
      price: 1990,
      sizes: ['M', 'L'],
      colors: [{ name: 'Чёрный', hex: '#1c1c1e' }],
      finance: { purchasePrice: 700, deliveryCost: 120, commission: 90, customs: 60, packaging: 40, paymentFee: 40, advertising: 100 },
      variants: [
        { size: 'M', color: 'Чёрный', stock: 5 },
        { size: 'L', color: 'Чёрный', stock: 4 },
      ],
      description: 'Тестовый товар смоук-теста',
    },
  });
  check('POST /api/admin/products создаёт товар', newProduct.status === 201 && newProduct.data.id > 0);
  check(
    'Админ видит себестоимость и прибыль товара',
    newProduct.data.finance.cost === 1150 && newProduct.data.finance.profit === 840,
    newProduct.data.finance,
  );

  const publicNew = await api('GET', `/api/products/${newProduct.data.id}`);
  check('Созданный товар виден в каталоге', publicNew.status === 200 && publicNew.data.name === 'Смоук-тест футболка');
  check('Публичная карточка не содержит finance', publicNew.data.finance === undefined);

  const updProduct = await api('PUT', `/api/admin/products/${newProduct.data.id}`, {
    token: adminToken,
    body: { price: 2490 },
  });
  check('PUT /api/admin/products/:id меняет цену', updProduct.status === 200 && updProduct.data.price === 2490);

  const stockUpd = await api('PUT', `/api/admin/products/${newProduct.data.id}/variants/${newProduct.data.variants[0].id}/stock`, {
    token: adminToken,
    body: { stock: 11 },
  });
  check('PUT .../stock меняет остаток', stockUpd.status === 200 && stockUpd.data.variants[0].stock === 11);

  const promo = await api('POST', '/api/admin/promocodes', {
    token: adminToken,
    body: { code: `SMOKE${Date.now() % 100000}`, type: 'percent', value: 15, minOrder: 0 },
  });
  check('POST /api/admin/promocodes создаёт промокод', promo.status === 201 && promo.data.isActive === true);

  const del = await api('DELETE', `/api/admin/products/${newProduct.data.id}`, { token: adminToken });
  check('DELETE /api/admin/products/:id снимает товар с продажи', del.status === 200 && del.data.success === true);

  // --- 404 ---
  const notFoundRes = await api('GET', '/api/products/999999');
  check('Несуществующий товар → 404', notFoundRes.status === 404);

  console.log(`\nИтого: ${passed} проверок пройдено, ${failed} провалено.`);
  if (failed > 0) {
    console.log('Провалены:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
  console.log('Все сценарии работают ✅\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Смоук-тест не удалось выполнить:', err);
  process.exit(1);
});
