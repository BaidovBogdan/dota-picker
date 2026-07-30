import { ArrowLeftIcon, MagnifyingGlassMinusIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="page not-found" id="main-content">
      <span>
        <MagnifyingGlassMinusIcon size={31} weight="duotone" aria-hidden />
      </span>
      <p className="eyebrow">Ошибка 404</p>
      <h1>Такого экрана нет</h1>
      <p>Ссылка устарела или была скопирована не полностью.</p>
      <Link className="button button--primary" to="/">
        <ArrowLeftIcon size={16} aria-hidden />
        На главную
      </Link>
    </main>
  );
}
