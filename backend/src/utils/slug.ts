const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Преобразует произвольную строку в URL-совместимый slug (с транслитерацией). */
export function slugify(input: string): string {
  const lower = input.trim().toLowerCase();
  let out = '';
  for (const ch of lower) {
    out += TRANSLIT[ch] ?? ch;
  }
  return out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/** Генерирует уникальный slug, добавляя числовой суффикс при коллизиях. */
export function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string>;
export function uniqueSlug(base: string, taken: Set<string>): string;
export function uniqueSlug(
  base: string,
  checker: ((slug: string) => Promise<boolean>) | Set<string>,
): string | Promise<string> {
  const root = slugify(base) || 'item';

  if (checker instanceof Set) {
    let slug = root;
    let i = 2;
    while (checker.has(slug)) slug = `${root}-${i++}`;
    return slug;
  }

  return (async () => {
    let slug = root;
    let i = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await checker(slug)) slug = `${root}-${i++}`;
    return slug;
  })();
}

/** Номер заказа вида RSL-20260417-4821. */
export function generateOrderNumber(seq: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(seq % 10000).padStart(4, '0');
  return `RSL-${y}${m}${d}-${rand}`;
}

/** Артикул вариации: HOO-BLK-L-1234 */
export function generateSku(productSlug: string, size: string, color: string, id: number): string {
  const p = productSlug.slice(0, 3).toUpperCase();
  const c = slugify(color).slice(0, 3).toUpperCase() || 'NA';
  const s = slugify(size).slice(0, 3).toUpperCase() || 'OS';
  return `${p}-${c}-${s}-${String(id).padStart(4, '0')}`;
}
