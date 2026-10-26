import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Toasts } from '../components/Toasts';

/** Обёртка публичной части магазина: шапка, контент, подвал. */
export function ShopLayout() {
  return (
    <>
      <Header />
      <main className="page">
        <Outlet />
      </main>
      <Footer />
      <Toasts />
    </>
  );
}
