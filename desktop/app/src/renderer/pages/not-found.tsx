import { ArrowLeftIcon, MagnifyingGlassMinusIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { useI18n } from '../i18n';

export function NotFoundPage() {
  const { text } = useI18n();
  return (
    <main className="page not-found" id="main-content">
      <span>
        <MagnifyingGlassMinusIcon size={31} weight="duotone" aria-hidden />
      </span>
      <p className="eyebrow">{text('Ошибка 404', 'Error 404')}</p>
      <h1>{text('Такого экрана нет', 'This screen does not exist')}</h1>
      <p>{text('Ссылка устарела или была скопирована не полностью.', 'The link is outdated or incomplete.')}</p>
      <Link className="button button--primary" to="/">
        <ArrowLeftIcon size={16} aria-hidden />
        {text('На главную', 'Back home')}
      </Link>
    </main>
  );
}
