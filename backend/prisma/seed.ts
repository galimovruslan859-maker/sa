/* eslint-disable no-console */
/**
 * Заполнение базы данных демо-данными магазина RESELL.
 *
 * Запуск:  npm run db:seed
 *
 * Создаёт: категории, поставщиков, товары с вариациями и фотографиями (SVG
 * генерируются локально в uploads/products), администратора и покупателей,
 * корзины, заказы в разных статусах, отзывы, промокоды, закупки и расходы.
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { env } from '../src/config/env';
import * as orderService from '../src/services/order.service';

// ---------------------------------------------------------------------------
// Подключение к БД (тот же механизм, что и в сервере)
// ---------------------------------------------------------------------------
async function createClient(): Promise<PrismaClient> {
  if (env.DATABASE_ENGINE === 'pg') {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) as never });
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { PrismaPGlite } = await import('pglite-prisma-adapter');
  return new PrismaClient({ adapter: new PrismaPGlite(new PGlite(env.pgliteDataDir)) as never });
}

// ---------------------------------------------------------------------------
// Генерация изображений товаров (локальные SVG, без внешних сервисов)
// ---------------------------------------------------------------------------
type Kind = 'tee' | 'hoodie' | 'sweatshirt' | 'shirt' | 'pants' | 'jeans' | 'jacket' | 'puffer' | 'shoes' | 'socks' | 'cap' | 'bag' | 'belt' | 'scarf';

const SHAPES: Record<Kind, string> = {
  tee: 'M118 52 L60 76 L38 138 L74 156 L74 254 L186 254 L186 156 L222 138 L200 76 L142 52 Q130 74 106 68 Z',
  hoodie:
    'M112 46 Q130 34 148 46 L204 70 L234 150 L196 166 L196 264 L64 264 L64 166 L26 150 L56 70 Z M112 46 Q130 76 148 46 Q152 88 130 92 Q108 88 112 46 Z',
  sweatshirt: 'M116 50 L58 72 L40 140 L74 152 L74 256 L186 256 L186 152 L220 140 L202 72 L144 50 Q130 70 116 50 Z',
  shirt:
    'M116 48 L64 70 L44 134 L76 146 L76 262 L184 262 L184 146 L216 134 L196 70 L144 48 L130 66 Z M130 66 L130 262',
  pants: 'M84 40 L176 40 L188 268 L146 268 L130 158 L114 268 L72 268 Z',
  jeans: 'M84 40 L176 40 L186 268 L146 268 L130 150 L114 268 L74 268 Z M84 62 L176 62',
  jacket:
    'M114 46 L58 70 L34 148 L70 162 L70 262 L190 262 L190 162 L226 148 L202 70 L146 46 L130 70 Z M130 70 L130 262',
  puffer:
    'M112 44 L54 70 L30 152 L68 166 L68 264 L192 264 L192 166 L230 152 L206 70 L148 44 Q130 66 112 44 Z M68 122 L192 122 M68 172 L192 172 M68 220 L192 220',
  shoes: 'M34 188 L96 174 L146 198 L206 206 Q230 212 228 232 L228 244 L34 244 Z',
  socks: 'M98 46 L154 46 L154 162 L188 198 Q200 214 186 226 L152 250 Q136 258 124 244 L98 202 Z',
  cap: 'M54 184 Q54 98 132 98 Q210 98 210 184 Z M54 184 L234 184 Q244 206 220 206 L60 206 Q44 206 54 184 Z',
  bag: 'M66 108 L194 108 L210 258 L50 258 Z M100 108 Q100 52 130 52 Q160 52 160 108',
  belt: 'M28 128 L204 128 L204 176 L28 176 Z M204 118 L246 118 L246 186 L204 186 Z',
  scarf: 'M96 40 L160 40 L160 196 L200 236 L168 268 L128 228 L96 268 L64 236 L104 196 Z',
};

const BG: Record<Kind, [string, string]> = {
  tee: ['#f6f6f4', '#e7e7e2'],
  hoodie: ['#f2f3f5', '#e2e4e8'],
  sweatshirt: ['#f7f5f1', '#eae5dc'],
  shirt: ['#f4f6f7', '#e3e9ec'],
  pants: ['#f5f4f2', '#e6e3de'],
  jeans: ['#f1f4f8', '#e0e7f0'],
  jacket: ['#f4f4f4', '#e4e4e4'],
  puffer: ['#f2f5f7', '#e1e8ed'],
  shoes: ['#f7f6f4', '#e9e6e0'],
  socks: ['#f6f6f6', '#e8e8e8'],
  cap: ['#f5f5f3', '#e6e6e1'],
  bag: ['#f4f3f1', '#e5e3de'],
  belt: ['#f6f5f3', '#e8e6e1'],
  scarf: ['#f7f5f6', '#e9e4e7'],
};

function svgFor(kind: Kind, colorHex: string, title: string, brand: string): string {
  const [c1, c2] = BG[kind];
  const shape = SHAPES[kind];
  const label = title.length > 26 ? `${title.slice(0, 25)}…` : title;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 300" width="520" height="600" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="260" height="300" fill="url(#bg)"/>
  <g fill="${colorHex}" fill-opacity="0.94" stroke="rgba(17,17,17,0.20)" stroke-width="2">
    <path d="${shape}"/>
  </g>
  <text x="130" y="288" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10.5" letter-spacing="1.6" fill="#6b6b6b">${brand.toUpperCase()} · RESELL</text>
</svg>`;
}

const COLOR_HEX: Record<string, string> = {
  'Чёрный': '#1c1c1e',
  'Белый': '#f8f8f6',
  'Бежевый': '#d8c7ab',
  'Серый': '#9a9a9a',
  'Графит': '#3d4148',
  'Хаки': '#6f7a52',
  'Синий': '#2f4a7d',
  'Голубой': '#7fa8d4',
  'Тёмно-синий': '#22314f',
  'Коричневый': '#7a5335',
  'Бордовый': '#7c2b34',
  'Молочный': '#efe7d8',
  'Оливковый': '#7d8a5c',
  'Красный': '#c0392b',
  'Пудровый': '#e3c3c0',
  'Кремовый': '#eadfc9',
  'Тёмно-зелёный': '#2f4f3a',
  'Жёлтый': '#e0b13c',
  'Мультиколор': '#8e6bb5',
  'Серебристый': '#c9ccd1',
};

function hexOf(color: string, fallback = '#4a4a4a'): string {
  return COLOR_HEX[color] ?? fallback;
}

// ---------------------------------------------------------------------------
// Каталог
// ---------------------------------------------------------------------------
type SeedProduct = {
  name: string;
  brand: string;
  price: number;
  purchase: number;
  delivery: number;
  commission: number;
  customs: number;
  packaging: number;
  paymentFee: number;
  advertising: number;
  composition: string;
  kind: Kind;
  colors: string[];
  sizes: string[];
  stock: [number, number];
  specs: Record<string, string>;
  description: string;
};

const CATALOG: Record<string, SeedProduct[]> = {
  'Футболки': [
    {
      name: 'Футболка оверсайз Basic',
      brand: 'Guangzhou Basic',
      price: 1290,
      purchase: 420,
      delivery: 90,
      commission: 60,
      customs: 40,
      packaging: 30,
      paymentFee: 26,
      advertising: 110,
      composition: '100% хлопок, плотность 220 г/м²',
      kind: 'tee',
      colors: ['Чёрный', 'Белый', 'Бежевый', 'Серый'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [4, 12],
      specs: { Крой: 'Оверсайз', Плотность: '220 г/м²', Уход: 'Стирка при 30°' },
      description:
        'Базовая футболка свободного кроя из плотного хлопка. Держит форму после стирок, не просвечивает. Универсальная модель на каждый день — сочетается с джинсами, карго и спортивными брюками.',
    },
    {
      name: 'Футболка с принтом Tokyo Street',
      brand: 'Urban Line',
      price: 1490,
      purchase: 510,
      delivery: 95,
      commission: 70,
      customs: 45,
      packaging: 30,
      paymentFee: 30,
      advertising: 150,
      composition: '95% хлопок, 5% эластан',
      kind: 'tee',
      colors: ['Белый', 'Графит'],
      sizes: ['M', 'L', 'XL'],
      stock: [3, 10],
      specs: { Крой: 'Прямой', Принт: 'Шелкография', Плотность: '200 г/м²' },
      description:
        'Футболка с графичным принтом, нанесённым шелкографией. Принт не трескается и не выцветает. Слегка эластичное полотно удобно садится по фигуре.',
    },
    {
      name: 'Футболка поло Pique',
      brand: 'Canton Pique',
      price: 1990,
      purchase: 690,
      delivery: 110,
      commission: 90,
      customs: 55,
      packaging: 35,
      paymentFee: 40,
      advertising: 130,
      composition: '100% хлопок пике',
      kind: 'shirt',
      colors: ['Тёмно-синий', 'Белый', 'Хаки'],
      sizes: ['M', 'L', 'XL', 'XXL'],
      stock: [2, 9],
      specs: { Крой: 'Regular', Воротник: 'Пике на пуговицах' },
      description:
        'Классическое поло из хлопкового пике. Воротник держит форму, планка на трёх пуговицах. Подходит и для офиса с нестрогим дресс-кодом, и для выходных.',
    },
  ],
  'Худи': [
    {
      name: 'Худи оверсайз с капюшоном',
      brand: 'Yiwu Heavy',
      price: 3490,
      purchase: 1250,
      delivery: 190,
      commission: 170,
      customs: 110,
      packaging: 60,
      paymentFee: 70,
      advertising: 260,
      composition: '80% хлопок, 20% полиэстер, футер трёхнитка с начёсом',
      kind: 'hoodie',
      colors: ['Чёрный', 'Серый', 'Бежевый', 'Хаки'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [3, 11],
      specs: { Крой: 'Оверсайз', Плотность: '380 г/м²', Капюшон: 'Двойной, со шнурком', Карман: 'Кенгуру' },
      description:
        'Плотное худи из футера с начёсом. Широкий капюшон, усиленные манжеты и карман-кенгуру. Одна из самых продаваемых позиций сезона — стабильный спрос и высокая маржинальность.',
    },
    {
      name: 'Худи на молнии Zip Tech',
      brand: 'Shenzhen Tech',
      price: 3990,
      purchase: 1480,
      delivery: 210,
      commission: 190,
      customs: 130,
      packaging: 65,
      paymentFee: 80,
      advertising: 240,
      composition: '75% хлопок, 25% полиэстер',
      kind: 'hoodie',
      colors: ['Графит', 'Чёрный', 'Синий'],
      sizes: ['M', 'L', 'XL', 'XXL'],
      stock: [2, 8],
      specs: { Застёжка: 'Металлическая молния', Плотность: '340 г/м²', Карманы: 'Два боковых' },
      description:
        'Худи на молнии с металлической фурнитурой и двумя боковыми карманами. Удобно носить как верхний слой в межсезонье.',
    },
  ],
  'Свитшоты': [
    {
      name: 'Свитшот базовый Crew',
      brand: 'Hangzhou Crew',
      price: 2790,
      purchase: 940,
      delivery: 160,
      commission: 130,
      customs: 90,
      packaging: 55,
      paymentFee: 56,
      advertising: 190,
      composition: '80% хлопок, 20% полиэстер, футер двухнитка',
      kind: 'sweatshirt',
      colors: ['Молочный', 'Чёрный', 'Серый', 'Бордовый'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [3, 10],
      specs: { Крой: 'Прямой', Плотность: '320 г/м²', Горловина: 'Круглая, рибана' },
      description:
        'Базовый свитшот без принта из мягкого футера. Рибана на горловине, манжетах и по низу держит форму. Хорошо смотрится и с джинсами, и с юбкой.',
    },
    {
      name: 'Свитшот с надписью Seoul',
      brand: 'Urban Line',
      price: 2990,
      purchase: 1010,
      delivery: 165,
      commission: 140,
      customs: 95,
      packaging: 55,
      paymentFee: 60,
      advertising: 230,
      composition: '80% хлопок, 20% полиэстер',
      kind: 'sweatshirt',
      colors: ['Пудровый', 'Графит', 'Кремовый'],
      sizes: ['S', 'M', 'L'],
      stock: [2, 9],
      specs: { Принт: 'Вышивка', Плотность: '320 г/м²' },
      description:
        'Свитшот с вышитой надписью — вышивка не трескается и переживает десятки стирок. Свободная посадка, спущенная линия плеча.',
    },
  ],
  'Рубашки': [
    {
      name: 'Рубашка оверсайз в клетку',
      brand: 'Foshan Check',
      price: 2690,
      purchase: 880,
      delivery: 150,
      commission: 120,
      customs: 85,
      packaging: 50,
      paymentFee: 54,
      advertising: 170,
      composition: '65% хлопок, 35% полиэстер',
      kind: 'shirt',
      colors: ['Синий', 'Хаки', 'Красный'],
      sizes: ['M', 'L', 'XL'],
      stock: [3, 9],
      specs: { Крой: 'Оверсайз', Застёжка: 'Пуговицы', Карманы: 'Нагрудный' },
      description:
        'Фланелевая рубашка в клетку свободного кроя. Можно носить как лёгкую куртку поверх футболки.',
    },
    {
      name: 'Рубашка из льна Summer',
      brand: 'Linen House',
      price: 3290,
      purchase: 1120,
      delivery: 175,
      commission: 150,
      customs: 100,
      packaging: 60,
      paymentFee: 66,
      advertising: 200,
      composition: '55% лён, 45% вискоза',
      kind: 'shirt',
      colors: ['Белый', 'Бежевый', 'Голубой'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [2, 8],
      specs: { Крой: 'Свободный', Сезон: 'Лето' },
      description:
        'Лёгкая льняная рубашка для жаркой погоды: дышит, быстро сохнет и красиво мнётся. Свободный крой не стесняет движений.',
    },
  ],
  'Брюки': [
    {
      name: 'Брюки карго Utility',
      brand: 'Canton Workwear',
      price: 3290,
      purchase: 1180,
      delivery: 180,
      commission: 150,
      customs: 110,
      packaging: 60,
      paymentFee: 66,
      advertising: 210,
      composition: '98% хлопок, 2% эластан',
      kind: 'pants',
      colors: ['Хаки', 'Чёрный', 'Бежевый'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [2, 9],
      specs: { Крой: 'Свободный', Карманы: '6 карманов', Пояс: 'На резинке и шнурке' },
      description:
        'Брюки-карго с шестью карманами и немного зауженной штаниной. Плотный хлопок с эластаном, пояс на резинке и шнурке.',
    },
    {
      name: 'Брюки спортивные Jogger',
      brand: 'Active Pro',
      price: 2490,
      purchase: 830,
      delivery: 145,
      commission: 115,
      customs: 80,
      packaging: 50,
      paymentFee: 50,
      advertising: 160,
      composition: '70% хлопок, 30% полиэстер',
      kind: 'pants',
      colors: ['Серый', 'Чёрный', 'Тёмно-синий'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [3, 12],
      specs: { Крой: 'Джоггеры', Манжеты: 'Рибана', Карманы: '2 боковых + задний' },
      description:
        'Спортивные джоггеры с манжетами на резинке. Мягкий футер, удобные карманы, хорошо держат форму после стирки.',
    },
  ],
  'Джинсы': [
    {
      name: 'Джинсы прямые Classic',
      brand: 'Denim Works',
      price: 3690,
      purchase: 1320,
      delivery: 195,
      commission: 165,
      customs: 120,
      packaging: 65,
      paymentFee: 74,
      advertising: 220,
      composition: '99% хлопок, 1% эластан, деним 12 oz',
      kind: 'jeans',
      colors: ['Синий', 'Чёрный', 'Голубой'],
      sizes: ['28', '30', '32', '34', '36'],
      stock: [2, 8],
      specs: { Посадка: 'Средняя', Крой: 'Прямой', Фурнитура: 'Металл' },
      description:
        'Классические прямые джинсы из плотного денима. Средняя посадка, пять карманов, металлическая фурнитура.',
    },
    {
      name: 'Джинсы широкие Wide Leg',
      brand: 'Denim Works',
      price: 3990,
      purchase: 1450,
      delivery: 205,
      commission: 180,
      customs: 130,
      packaging: 70,
      paymentFee: 80,
      advertising: 240,
      composition: '100% хлопок, деним 13 oz',
      kind: 'jeans',
      colors: ['Голубой', 'Тёмно-синий'],
      sizes: ['26', '28', '30', '32'],
      stock: [2, 7],
      specs: { Посадка: 'Высокая', Крой: 'Широкий' },
      description:
        'Широкие джинсы с высокой посадкой из плотного денима без эластана. Визуально вытягивают силуэт.',
    },
  ],
  'Куртки': [
    {
      name: 'Куртка-бомбер Varsity',
      brand: 'Shanghai Varsity',
      price: 5490,
      purchase: 2050,
      delivery: 260,
      commission: 230,
      customs: 180,
      packaging: 90,
      paymentFee: 110,
      advertising: 320,
      composition: 'Верх: 100% полиэстер, подкладка: хлопок',
      kind: 'jacket',
      colors: ['Чёрный', 'Бежевый', 'Тёмно-зелёный'],
      sizes: ['M', 'L', 'XL'],
      stock: [2, 7],
      specs: { Сезон: 'Демисезон', Застёжка: 'Кнопки', Подкладка: 'Есть' },
      description:
        'Бомбер в университетском стиле: плотный верх, трикотажные манжеты и воротник, подкладка из хлопка. Рассчитан на прохладную осень.',
    },
    {
      name: 'Куртка джинсовая Oversize',
      brand: 'Denim Works',
      price: 4690,
      purchase: 1720,
      delivery: 240,
      commission: 210,
      customs: 160,
      packaging: 85,
      paymentFee: 94,
      advertising: 280,
      composition: '100% хлопок, деним 11 oz',
      kind: 'jacket',
      colors: ['Голубой', 'Синий'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [2, 8],
      specs: { Крой: 'Оверсайз', Сезон: 'Демисезон' },
      description:
        'Джинсовая куртка свободного кроя из мягкого денима. Два нагрудных кармана с клапаном, металлическая фурнитура.',
    },
    {
      name: 'Куртка ветрозащитная Windbreaker',
      brand: 'Active Pro',
      price: 3890,
      purchase: 1380,
      delivery: 215,
      commission: 190,
      customs: 140,
      packaging: 75,
      paymentFee: 78,
      advertising: 230,
      composition: '100% нейлон с водоотталкивающей пропиткой',
      kind: 'jacket',
      colors: ['Чёрный', 'Хаки', 'Синий'],
      sizes: ['M', 'L', 'XL'],
      stock: [2, 9],
      specs: { Капюшон: 'В воротнике', Пропитка: 'DWR', Вес: '420 г' },
      description:
        'Лёгкая ветровка с водоотталкивающей пропиткой и капюшоном, который прячется в воротник. Складывается в собственный карман.',
    },
  ],
  'Пуховики': [
    {
      name: 'Пуховик стёганый Winter',
      brand: 'Harbin Winter',
      price: 8990,
      purchase: 3450,
      delivery: 420,
      commission: 380,
      customs: 300,
      packaging: 140,
      paymentFee: 180,
      advertising: 480,
      composition: 'Верх: полиэстер, утеплитель: биопух 300 г/м²',
      kind: 'puffer',
      colors: ['Чёрный', 'Бежевый', 'Хаки'],
      sizes: ['S', 'M', 'L', 'XL'],
      stock: [2, 6],
      specs: { 'Температурный режим': 'до −25°', Утеплитель: 'Биопух 300 г/м²', Капюшон: 'Несъёмный' },
      description:
        'Стёганый пуховик с биопухом: держит тепло до −25°, не боится влаги и легко стирается. Высокий воротник и глубокий капюшон.',
    },
    {
      name: 'Пуховик удлинённый Arctic',
      brand: 'Harbin Winter',
      price: 11490,
      purchase: 4480,
      delivery: 520,
      commission: 470,
      customs: 390,
      packaging: 170,
      paymentFee: 230,
      advertising: 560,
      composition: 'Верх: мембранный полиэстер, утеплитель: биопух 350 г/м²',
      kind: 'puffer',
      colors: ['Графит', 'Чёрный', 'Тёмно-синий'],
      sizes: ['M', 'L', 'XL'],
      stock: [1, 5],
      specs: { 'Температурный режим': 'до −30°', Длина: 'Ниже колена', Мембрана: '5000/5000' },
      description:
        'Удлинённый пуховик с мембранной тканью и утеплителем 350 г/м². Закрывает бёдра, рассчитан на уральскую зиму.',
    },
  ],
  'Обувь': [
    {
      name: 'Кроссовки Runner Air',
      brand: 'Step One',
      price: 5990,
      purchase: 2180,
      delivery: 300,
      commission: 250,
      customs: 200,
      packaging: 110,
      paymentFee: 120,
      advertising: 380,
      composition: 'Верх: текстиль и синтетика, подошва: EVA',
      kind: 'shoes',
      colors: ['Чёрный', 'Белый', 'Серый'],
      sizes: ['38', '39', '40', '41', '42', '43', '44'],
      stock: [1, 6],
      specs: { Тип: 'Беговые', Подошва: 'EVA, амортизация', Вес: '280 г (42 размер)' },
      description:
        'Лёгкие кроссовки с амортизирующей подошвой и дышащим верхом. Подойдут для города и спортзала.',
    },
    {
      name: 'Кеды низкие Canvas',
      brand: 'Step One',
      price: 2990,
      purchase: 990,
      delivery: 190,
      commission: 140,
      customs: 100,
      packaging: 70,
      paymentFee: 60,
      advertising: 180,
      composition: 'Верх: канвас, подошва: вулканизированная резина',
      kind: 'shoes',
      colors: ['Белый', 'Чёрный', 'Бежевый'],
      sizes: ['36', '37', '38', '39', '40', '41', '42', '43'],
      stock: [2, 8],
      specs: { Тип: 'Кеды', Застёжка: 'Шнурки' },
      description:
        'Классические тканевые кеды на вулканизированной подошве. Неубиваемая база гардероба.',
    },
    {
      name: 'Ботинки челси Urban',
      brand: 'North Sole',
      price: 6490,
      purchase: 2450,
      delivery: 330,
      commission: 280,
      customs: 220,
      packaging: 120,
      paymentFee: 130,
      advertising: 400,
      composition: 'Верх: искусственная кожа, подкладка: текстиль',
      kind: 'shoes',
      colors: ['Чёрный', 'Коричневый'],
      sizes: ['39', '40', '41', '42', '43', '44'],
      stock: [1, 6],
      specs: { Тип: 'Челси', Сезон: 'Демисезон', Подошва: 'ТЭП, нескользящая' },
      description:
        'Челси с эластичными вставками по бокам и нескользящей подошвой. Легко надевать, удобно носить весь день.',
    },
  ],
  'Аксессуары': [
    {
      name: 'Носки набор из 5 пар',
      brand: 'Guangzhou Basic',
      price: 890,
      purchase: 240,
      delivery: 70,
      commission: 40,
      customs: 25,
      packaging: 30,
      paymentFee: 18,
      advertising: 90,
      composition: '80% хлопок, 17% полиамид, 3% эластан',
      kind: 'socks',
      colors: ['Чёрный', 'Белый', 'Мультиколор'],
      sizes: ['36-39', '40-43', '44-47'],
      stock: [5, 20],
      specs: { 'В наборе': '5 пар', Высота: 'Средние' },
      description:
        'Набор из пяти пар базовых носков с усиленной пяткой и мыском. Хорошо тянутся, не сползают.',
    },
    {
      name: 'Кепка Structured',
      brand: 'Canton Workwear',
      price: 1190,
      purchase: 350,
      delivery: 85,
      commission: 55,
      customs: 35,
      packaging: 40,
      paymentFee: 24,
      advertising: 110,
      composition: '100% хлопок',
      kind: 'cap',
      colors: ['Чёрный', 'Бежевый', 'Хаки', 'Синий'],
      sizes: ['One size'],
      stock: [4, 15],
      specs: { Размер: 'Регулируется ремешком', Козырёк: 'Изогнутый' },
      description:
        'Кепка из плотного хлопка с формованным козырьком и металлической застёжкой. Держит форму даже без головы внутри.',
    },
    {
      name: 'Сумка-шоппер Canvas',
      brand: 'Linen House',
      price: 1490,
      purchase: 480,
      delivery: 100,
      commission: 70,
      customs: 45,
      packaging: 45,
      paymentFee: 30,
      advertising: 130,
      composition: '100% канвас, плотность 12 oz',
      kind: 'bag',
      colors: ['Кремовый', 'Чёрный'],
      sizes: ['One size'],
      stock: [3, 12],
      specs: { Вместимость: '15 л', Карманы: 'Внутренний карман' },
      description:
        'Вместительный шоппер из плотного канваса с внутренним карманом. Выдерживает ноутбук и продукты на неделю.',
    },
    {
      name: 'Ремень кожаный Classic',
      brand: 'North Sole',
      price: 1690,
      purchase: 560,
      delivery: 95,
      commission: 80,
      customs: 50,
      packaging: 50,
      paymentFee: 34,
      advertising: 120,
      composition: 'Натуральная кожа, металлическая пряжка',
      kind: 'belt',
      colors: ['Чёрный', 'Коричневый'],
      sizes: ['95', '100', '105', '110'],
      stock: [2, 10],
      specs: { Ширина: '3,5 см', Пряжка: 'Металл, сатин' },
      description:
        'Классический кожаный ремень шириной 3,5 см с сатиновой пряжкой. Подходит и к джинсам, и к брюкам.',
    },
    {
      name: 'Шарф шерстяной Wool',
      brand: 'Harbin Winter',
      price: 1890,
      purchase: 640,
      delivery: 110,
      commission: 90,
      customs: 55,
      packaging: 55,
      paymentFee: 38,
      advertising: 140,
      composition: '70% шерсть, 30% акрил',
      kind: 'scarf',
      colors: ['Серый', 'Бежевый', 'Бордовый'],
      sizes: ['One size'],
      stock: [3, 14],
      specs: { Размер: '180 × 35 см', Сезон: 'Зима' },
      description:
        'Тёплый шерстяной шарф 180×35 см. Не колется, хорошо драпируется и переживает машинную стирку в режиме шерсти.',
    },
  ],
};

const CATEGORY_META: Array<{ name: string; description: string }> = [
  { name: 'Футболки', description: 'Базовые и принтованные футболки из хлопка' },
  { name: 'Худи', description: 'Худи с капюшоном и на молнии из плотного футера' },
  { name: 'Свитшоты', description: 'Свитшоты прямого и свободного кроя' },
  { name: 'Рубашки', description: 'Рубашки из хлопка, льна и фланели' },
  { name: 'Брюки', description: 'Карго, джоггеры и классические брюки' },
  { name: 'Джинсы', description: 'Прямые, широкие и зауженные джинсы' },
  { name: 'Куртки', description: 'Бомберы, ветровки и джинсовые куртки' },
  { name: 'Пуховики', description: 'Тёплые пуховики для зимы' },
  { name: 'Обувь', description: 'Кроссовки, кеды и ботинки' },
  { name: 'Аксессуары', description: 'Носки, кепки, сумки, ремни и шарфы' },
];

// ---------------------------------------------------------------------------
// Пользователи и заказы
// ---------------------------------------------------------------------------
const CUSTOMERS = [
  { email: 'anna@example.com', firstName: 'Анна', lastName: 'Ковалёва', phone: '+7 912 345-67-01', city: 'Челябинск' },
  { email: 'igor@example.com', firstName: 'Игорь', lastName: 'Сафин', phone: '+7 912 345-67-02', city: 'Екатеринбург' },
  { email: 'maria@example.com', firstName: 'Мария', lastName: 'Лебедева', phone: '+7 912 345-67-03', city: 'Москва' },
  { email: 'pavel@example.com', firstName: 'Павел', lastName: 'Громов', phone: '+7 912 345-67-04', city: 'Казань' },
  { email: 'olga@example.com', firstName: 'Ольга', lastName: 'Мирова', phone: '+7 912 345-67-05', city: 'Челябинск' },
  { email: 'demo@resell.ru', firstName: 'Демо', lastName: 'Покупатель', phone: '+7 900 000-00-00', city: 'Челябинск' },
];

const PICKUP_POINTS = [
  'Челябинск, ул. Кирова, 159 (СДЭК)',
  'Челябинск, пр. Ленина, 79 (СДЭК)',
  'Екатеринбург, ул. Малышева, 51 (СДЭК)',
];

const STATUSES: orderService.OrderStatus[] = [
  'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
  'shipped', 'shipped', 'processing', 'paid', 'pending', 'cancelled',
];

/** Псевдослучайный генератор с фиксированным зерном — данные стабильны между запусками. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const REVIEW_TEXTS = [
  { rating: 5, title: 'Отличное качество', body: 'Пришло за 9 дней в Челябинск. Ткань плотная, швы ровные, размер соответствует таблице. Буду заказывать ещё.' },
  { rating: 5, title: 'Супер', body: 'Взяла на размер больше, как советовали в описании, — село идеально. Цвет как на фото.' },
  { rating: 4, title: 'Хорошо, но есть нюанс', body: 'Качество за эти деньги отличное. Немного длиннее, чем ожидала, но носить можно.' },
  { rating: 5, title: 'Рекомендую', body: 'Вторая покупка в этом магазине. Упаковано аккуратно, всё как в описании.' },
  { rating: 3, title: 'Нормально', body: 'Ткань тоньше, чем хотелось бы. За такую цену приемлемо, но ожидал большего.' },
  { rating: 4, title: 'Доволен', body: 'Носил месяц, после стирок форму не потеряло. Доставка чуть задержалась.' },
];

// ---------------------------------------------------------------------------
// Основная логика
// ---------------------------------------------------------------------------
async function main() {
  const db = await createClient();
  const rand = makeRandom(20261024);

  // --if-empty: заполнить базу только если она пустая (используется в Docker)
  if (process.argv.includes('--if-empty')) {
    const existing = await db.user.count();
    if (existing > 0) {
      console.log(`✔ В базе уже есть данные (пользователей: ${existing}) — заполнение пропущено.`);
      console.log('  Для полной перезаписи демо-данными запустите: npm run db:seed');
      await db.$disconnect();
      return;
    }
  }

  console.log('→ Очищаю таблицы...');
  // Порядок важен из-за внешних ключей
  await db.expense.deleteMany();
  await db.purchaseItem.deleteMany();
  await db.purchase.deleteMany();
  await db.promoUsage.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.review.deleteMany();
  await db.favorite.deleteMany();
  await db.cartItem.deleteMany();
  await db.productImage.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.promocode.deleteMany();
  await db.supplier.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();

  console.log('→ Создаю пользователей...');
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await db.user.create({
    data: {
      email: 'admin@resell.ru',
      passwordHash,
      firstName: 'Руслан',
      lastName: 'Галимов',
      phone: '+7 900 111-22-33',
      role: 'ADMIN',
    },
  });

  const customerHash = await bcrypt.hash('demo1234', 10);
  const customers: Array<{
    id: number;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    city: string;
    email: string;
  }> = [];
  for (const c of CUSTOMERS) {
    const { city, ...userData } = c;
    const user = await db.user.create({
      data: { ...userData, passwordHash: customerHash, role: 'CUSTOMER' },
    });
    customers.push({ ...user, city });
  }

  console.log('→ Создаю поставщиков...');
  const suppliers: Array<{ id: number; name: string }> = [];
  for (const s of [
    { name: 'Guangzhou Textile Co.', contactName: 'Li Wei', phone: '+86 138 0000 1111', email: 'sales@gz-textile.cn', country: 'Китай', note: 'Хлопок, базовые модели, фабрика в Гуанчжоу' },
    { name: 'Yiwu Apparel Market', contactName: 'Chen Hao', phone: '+86 139 0000 2222', email: 'chen@yiwu-apparel.cn', country: 'Китай', note: 'Худи и свитшоты, мелкие партии' },
    { name: 'Shenzhen Step Trading', contactName: 'Wang Fang', phone: '+86 137 0000 3333', email: 'wang@sz-step.cn', country: 'Китай', note: 'Обувь и аксессуары' },
    { name: 'Harbin Winter Goods', contactName: 'Zhao Ming', phone: '+86 136 0000 4444', email: 'zhao@harbin-winter.cn', country: 'Китай', note: 'Верхняя одежда, зимний ассортимент' },
  ]) {
    suppliers.push(await db.supplier.create({ data: s }));
  }
  const supplierFor = (i: number) => suppliers[i % suppliers.length];

  console.log('→ Создаю категории...');
  const categories = [];
  for (let i = 0; i < CATEGORY_META.length; i += 1) {
    const meta = CATEGORY_META[i];
    categories.push(
      await db.category.create({
        data: {
          name: meta.name,
          slug: slugFromName(meta.name),
          description: meta.description,
          sortOrder: i,
        },
      }),
    );
  }
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  console.log('→ Генерирую фотографии товаров (SVG)...');
  const imagesDir = path.join(env.uploadDir, 'products');
  fs.mkdirSync(imagesDir, { recursive: true });

  console.log('→ Создаю товары и вариации...');
  let skuCounter = 0;
  const createdProducts: Array<{ id: number; name: string; priceCents: number; variants: Array<{ id: number; stock: number }> }> = [];
  let productIndex = 0;

  for (const [categoryName, items] of Object.entries(CATALOG)) {
    const category = categoryByName.get(categoryName)!;
    for (const item of items) {
      productIndex += 1;
      const slug = slugFromName(item.name);

      const product = await db.product.create({
        data: {
          name: item.name,
          slug,
          description: item.description,
          brand: item.brand,
          categoryId: category.id,
          supplierId: supplierFor(productIndex).id,
          composition: item.composition,
          specs: item.specs as Prisma.InputJsonValue,
          sizes: item.sizes,
          colors: item.colors.map((c) => ({ name: c, hex: hexOf(c) })) as unknown as Prisma.InputJsonValue,
          priceCents: Math.round(item.price * 100),
          purchasePriceCents: Math.round(item.purchase * 100),
          deliveryCostCents: Math.round(item.delivery * 100),
          commissionCents: Math.round(item.commission * 100),
          customsCents: Math.round(item.customs * 100),
          packagingCents: Math.round(item.packaging * 100),
          paymentFeeCents: Math.round(item.paymentFee * 100),
          advertisingCents: Math.round(item.advertising * 100),
          isActive: true,
          // Дата добавления «размазана» по последним 90 дням
          createdAt: new Date(Date.now() - Math.floor(rand() * 90) * 86_400_000),
        },
      });

      // Изображения: основное + по одному на каждый цвет
      const colorList = item.colors.slice(0, 3);
      for (let ci = 0; ci < colorList.length; ci += 1) {
        const color = colorList[ci];
        const fileName = `${slug}-${slugFromName(color)}.svg`;
        fs.writeFileSync(
          path.join(imagesDir, fileName),
          svgFor(item.kind, hexOf(color), `${item.name} · ${color}`, item.brand),
          'utf8',
        );
        await db.productImage.create({
          data: {
            productId: product.id,
            url: `/uploads/products/${fileName}`,
            alt: `${item.name} — ${color}`,
            sortOrder: ci,
            isPrimary: ci === 0,
          },
        });
      }

      // Вариации: размер × цвет
      const variants: Array<{ id: number; stock: number }> = [];
      for (const color of item.colors) {
        for (const size of item.sizes) {
          skuCounter += 1;
          const stock = item.stock[0] + Math.floor(rand() * (item.stock[1] - item.stock[0] + 1));
          const variant = await db.productVariant.create({
            data: {
              productId: product.id,
              size,
              color,
              sku: `${slugCode(slug)}-${slugCode(color)}-${slugCode(size)}-${String(skuCounter).padStart(5, '0')}`,
              stock,
              purchasePriceCents: Math.round(item.purchase * 100),
            },
          });
          variants.push({ id: variant.id, stock });
        }
      }

      createdProducts.push({ id: product.id, name: item.name, priceCents: product.priceCents, variants });
    }
  }

  console.log(`→ Создано товаров: ${createdProducts.length}`);

  console.log('→ Создаю промокоды...');
  await db.promocode.createMany({
    data: [
      { code: 'RESELL10', type: 'percent', value: 10, minOrderCents: 0, isActive: true },
      { code: 'FIRST500', type: 'fixed', value: 50000, minOrderCents: 300000, isActive: true },
      {
        code: 'WINTER20',
        type: 'percent',
        value: 20,
        minOrderCents: 500000,
        maxUses: 100,
        expiresAt: new Date(Date.now() + 60 * 86_400_000),
        isActive: true,
      },
      { code: 'OLD2024', type: 'percent', value: 15, minOrderCents: 0, isActive: false },
    ],
  });

  console.log('→ Оформляю демо-заказы через сервис заказов...');
  const ordersCreated: number[] = [];
  for (let i = 0; i < 26; i += 1) {
    const customer = customers[Math.floor(rand() * customers.length)];
    // Наполняем корзину 1–3 товарами
    const linesCount = 1 + Math.floor(rand() * 3);
    const picked = new Set<number>();
    for (let l = 0; l < linesCount; l += 1) {
      const p = createdProducts[Math.floor(rand() * createdProducts.length)];
      const available = p.variants.filter((v) => v.stock >= 2);
      if (available.length === 0) continue;
      const v = available[Math.floor(rand() * available.length)];
      if (picked.has(v.id)) continue;
      picked.add(v.id);
      await db.cartItem.upsert({
        where: { userId_variantId: { userId: customer.id, variantId: v.id } },
        update: { quantity: 1 + Math.floor(rand() * 2) },
        create: { userId: customer.id, variantId: v.id, quantity: 1 + Math.floor(rand() * 2) },
      });
    }

    const cartCount = await db.cartItem.count({ where: { userId: customer.id } });
    if (cartCount === 0) continue;

    const deliveryMethod = (['pickup', 'courier', 'post'] as const)[Math.floor(rand() * 3)];
    const status = STATUSES[i % STATUSES.length];
    const daysAgo = Math.floor(rand() * 45);
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000 - Math.floor(rand() * 20) * 3_600_000);
    try {
      const order = await orderService.createOrder(db, customer.id, {
        customerName: `${customer.firstName} ${customer.lastName ?? ''}`.trim(),
        phone: customer.phone!,
        city: customer.city,
        deliveryMethod,
        address: deliveryMethod === 'pickup' ? undefined : 'ул. Труда, 45, кв. 12',
        pickupPoint: deliveryMethod === 'pickup' ? PICKUP_POINTS[Math.floor(rand() * PICKUP_POINTS.length)] : undefined,
        comment: i % 5 === 0 ? 'Позвоните перед доставкой' : undefined,
        promocode: i % 7 === 0 ? 'RESELL10' : undefined,
      });
      // Демо-заказ «переносим в прошлое» и выставляем нужный статус
      await db.order.update({ where: { id: order.id }, data: { status, createdAt } });
      ordersCreated.push(order.id);
    } catch (err) {
      // Промокод может быть уже использован этим покупателем — очищаем корзину и продолжаем
      console.warn(`  ! заказ пропущен: ${err instanceof Error ? err.message : err}`);
      await db.cartItem.deleteMany({ where: { userId: customer.id } });
    }
  }

  console.log(`→ Создано заказов: ${ordersCreated.length}`);

  console.log('→ Добавляю отзывы (только от покупателей с заказами)...');
  const buyers = await db.orderItem.findMany({
    where: { order: { status: { in: ['delivered', 'shipped'] } } },
    select: { productId: true, order: { select: { userId: true } } },
  });
  const seen = new Set<string>();
  let reviewsCount = 0;
  for (const row of buyers) {
    const key = `${row.order.userId}-${row.productId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (rand() < 0.45) continue; // не все покупатели пишут отзывы
    const text = REVIEW_TEXTS[Math.floor(rand() * REVIEW_TEXTS.length)];
    await db.review.create({
      data: {
        productId: row.productId,
        userId: row.order.userId,
        rating: text.rating,
        title: text.title,
        body: text.body,
        createdAt: new Date(Date.now() - Math.floor(rand() * 30) * 86_400_000),
      } as Prisma.ReviewUncheckedCreateInput,
    });
    reviewsCount += 1;
  }
  console.log(`   отзывов: ${reviewsCount}`);

  console.log('→ Добавляю избранное и корзины...');
  for (const customer of customers) {
    const favCount = 2 + Math.floor(rand() * 4);
    const picked = new Set<number>();
    for (let i = 0; i < favCount; i += 1) {
      const p = createdProducts[Math.floor(rand() * createdProducts.length)];
      if (picked.has(p.id)) continue;
      picked.add(p.id);
      await db.favorite.create({ data: { userId: customer.id, productId: p.id } }).catch(() => undefined);
    }
  }
  // Корзина демо-покупателя
  const demoCustomer = customers[customers.length - 1];
  const cartPick = createdProducts.slice(0, 2);
  for (const p of cartPick) {
    await db.cartItem.create({
      data: { userId: demoCustomer.id, variantId: p.variants[0].id, quantity: 1 },
    }).catch(() => undefined);
  }

  console.log('→ Создаю закупки у поставщиков...');
  for (let i = 0; i < 4; i += 1) {
    const supplier = suppliers[i % suppliers.length];
    const items = createdProducts
      .filter((_, idx) => idx % 5 === i)
      .slice(0, 5)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        quantity: 20 + Math.floor(rand() * 40),
        unitCostCents: Math.round(p.priceCents * (0.28 + rand() * 0.1)),
      }));
    if (items.length === 0) continue;
    const totalCents = items.reduce((s, it) => s + it.unitCostCents * it.quantity, 0);
    await db.purchase.create({
      data: {
        number: `PUR-2026-${String(i + 1).padStart(3, '0')}`,
        supplierId: supplier.id,
        status: i === 0 ? 'received' : i === 1 ? 'in_transit' : 'ordered',
        orderDate: new Date(Date.now() - (30 + i * 12) * 86_400_000),
        receivedAt: i === 0 ? new Date(Date.now() - (15 + i * 5) * 86_400_000) : null,
        totalCents,
        deliveryCents: Math.round(totalCents * 0.08),
        commissionCents: Math.round(totalCents * 0.06),
        customsCents: Math.round(totalCents * 0.05),
        note: 'Партия сформирована посредником в Гуанчжоу',
        items: { create: items },
      },
    });
  }

  console.log('→ Создаю расходы магазина...');
  // Прочие расходы магазина за период. Подбирались так, чтобы демо-период
  // показывал реалистичную положительную прибыль после всех вычетов.
  const expenseRows = [
    { category: 'advertising' as const, amount: 18000, title: 'Реклама ВКонтакте', daysAgo: 5 },
    { category: 'advertising' as const, amount: 9500, title: 'Посевы в Telegram-каналах', daysAgo: 12 },
    { category: 'logistics' as const, amount: 12400, title: 'Доставка партии из Китая', daysAgo: 18 },
    { category: 'packaging' as const, amount: 4200, title: 'Пакеты и бирки', daysAgo: 22 },
    { category: 'payment_fee' as const, amount: 8900, title: 'Комиссия эквайринга', daysAgo: 8 },
    { category: 'rent' as const, amount: 15000, title: 'Аренда пункта выдачи', daysAgo: 3 },
    { category: 'salary' as const, amount: 12000, title: 'Зарплата контент-менеджера', daysAgo: 10 },
    { category: 'other' as const, amount: 4300, title: 'Фотосъёмка товаров', daysAgo: 27 },
  ];
  const expensesTotal = expenseRows.reduce((sum, e) => sum + e.amount * 100, 0);
  for (const e of expenseRows) {
    await db.expense.create({
      data: {
        category: e.category,
        amountCents: e.amount * 100,
        title: e.title,
        date: new Date(Date.now() - e.daysAgo * 86_400_000),
      },
    });
  }

  console.log('→ Итоговая сверка...');
  const [pCount, oCount, uCount, vCount] = await Promise.all([
    db.product.count(),
    db.order.count(),
    db.user.count(),
    db.productVariant.count(),
  ]);
  const finance = await db.order.aggregate({
    where: { status: { in: orderService.REVENUE_STATUSES } },
    _sum: { itemsTotalCents: true, discountCents: true, costCents: true, deliveryCostCents: true },
  });
  const revenue =
    (finance._sum.itemsTotalCents ?? 0) - (finance._sum.discountCents ?? 0) + (finance._sum.deliveryCostCents ?? 0);
  const profit = revenue - (finance._sum.costCents ?? 0);
  const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;

  console.log('');
  console.log('==================== SEED ГОТОВ ====================');
  console.log(` товаров: ${pCount}   вариаций: ${vCount}`);
  console.log(` заказов: ${oCount}   пользователей: ${uCount}`);
  console.log(` выручка: ${(revenue / 100).toLocaleString('ru-RU')} ₽`);
  console.log(` себестоимость: ${((finance._sum.costCents ?? 0) / 100).toLocaleString('ru-RU')} ₽`);
  console.log(` прибыль (до прочих расходов): ${(profit / 100).toLocaleString('ru-RU')} ₽  маржа ${margin}%`);
  console.log(` прочие расходы: ${(expensesTotal / 100).toLocaleString('ru-RU')} ₽`);
  console.log(` чистая прибыль: ${((profit - expensesTotal) / 100).toLocaleString('ru-RU')} ₽`);
  console.log('');
  console.log(' Администратор: admin@resell.ru / admin123');
  console.log(' Покупатель:    demo@resell.ru  / demo1234');
  console.log(' Промокод:      RESELL10 (−10%)');
  console.log('====================================================');

  await db.$disconnect();
}

/** Транслитерация + slug (дублируем логику utils/slug, чтобы сид был независимым). */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Короткий код для артикула: согласные латиницы/транслита + цифры. */
function slugCode(input: string): string {
  const code = slugFromName(input).replace(/[^a-z0-9]/g, '');
  return (code.slice(0, 4) || 'ITEM').toUpperCase();
}

function slugFromName(input: string): string {
  const lower = input.trim().toLowerCase();
  let out = '';
  for (const ch of lower) out += TRANSLIT[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    // У Prisma очень многословные сообщения — выводим только полезную часть
    const message =
      err instanceof Error
        ? err.message
            .split('\n')
            .filter((line) => line.length < 400)
            .slice(-14)
            .join('\n')
        : String(err);
    console.error('\nОшибка при заполнении БД:\n', message);
    process.exit(1);
  });
