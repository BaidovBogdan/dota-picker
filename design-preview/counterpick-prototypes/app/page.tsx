"use client";

import {
  AlertTriangle,
  Aperture,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  GitCompareArrows,
  History,
  Home,
  ImageOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Map,
  Menu,
  Moon,
  Plus,
  Radio,
  RotateCcw,
  ScanLine,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Sun,
  Swords,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Lottie from "lottie-react";
import { useEffect, useMemo, useRef, useState } from "react";
import confirmRune from "./animations/confirm-rune.json";
import emptyPortal from "./animations/empty-portal.json";
import warningRune from "./animations/warning-rune.json";

type Screen =
  | "home"
  | "heroes"
  | "photo"
  | "analysis"
  | "result"
  | "history"
  | "profile"
  | "auth"
  | "plans"
  | "states";

type ThemeMode = "light" | "dark";
type Side = "ally" | "enemy";
type StateId =
  | "loading"
  | "error"
  | "empty"
  | "no-photo"
  | "limit"
  | "offline"
  | "delete";

type Hero = {
  id: number;
  name: string;
  slug: string;
  attribute: "Сила" | "Ловкость" | "Интеллект" | "Универсальный";
  positions: number[];
};

type DesignInfo = {
  id: string;
  index: string;
  name: string;
  subtitle: string;
  thesis: string;
  icon: LucideIcon;
  colors: string[];
};

const heroImage = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;

const heroes: Hero[] = [
  { id: 5, name: "Crystal Maiden", slug: "crystal_maiden", attribute: "Интеллект", positions: [4, 5] },
  { id: 2, name: "Axe", slug: "axe", attribute: "Сила", positions: [3] },
  { id: 59, name: "Huskar", slug: "huskar", attribute: "Сила", positions: [2] },
  { id: 44, name: "Phantom Assassin", slug: "phantom_assassin", attribute: "Ловкость", positions: [1] },
  { id: 14, name: "Pudge", slug: "pudge", attribute: "Сила", positions: [2, 3, 4] },
  { id: 12, name: "Phantom Lancer", slug: "phantom_lancer", attribute: "Ловкость", positions: [1] },
  { id: 35, name: "Sniper", slug: "sniper", attribute: "Ловкость", positions: [1, 2] },
  { id: 26, name: "Lion", slug: "lion", attribute: "Интеллект", positions: [4, 5] },
  { id: 31, name: "Lich", slug: "lich", attribute: "Интеллект", positions: [5] },
  { id: 47, name: "Viper", slug: "viper", attribute: "Ловкость", positions: [2, 3] },
  { id: 36, name: "Necrophos", slug: "necrolyte", attribute: "Интеллект", positions: [2, 3] },
  { id: 15, name: "Razor", slug: "razor", attribute: "Ловкость", positions: [1, 2, 3] },
  { id: 52, name: "Leshrac", slug: "leshrac", attribute: "Интеллект", positions: [2] },
  { id: 17, name: "Storm Spirit", slug: "storm_spirit", attribute: "Интеллект", positions: [2] },
  { id: 120, name: "Pangolier", slug: "pangolier", attribute: "Универсальный", positions: [2, 3] },
  { id: 68, name: "Ancient Apparition", slug: "ancient_apparition", attribute: "Интеллект", positions: [4, 5] },
  { id: 1, name: "Anti-Mage", slug: "antimage", attribute: "Ловкость", positions: [1] },
  { id: 104, name: "Legion Commander", slug: "legion_commander", attribute: "Сила", positions: [3] },
  { id: 22, name: "Zeus", slug: "zuus", attribute: "Интеллект", positions: [2, 4] },
  { id: 25, name: "Lina", slug: "lina", attribute: "Ловкость", positions: [1, 2, 4] },
  { id: 11, name: "Shadow Fiend", slug: "nevermore", attribute: "Ловкость", positions: [1, 2] },
  { id: 13, name: "Puck", slug: "puck", attribute: "Интеллект", positions: [2] },
  { id: 88, name: "Nyx Assassin", slug: "nyx_assassin", attribute: "Универсальный", positions: [3, 4] },
];

const designs: DesignInfo[] = [
  {
    id: "aegis",
    index: "01",
    name: "Aegis Aperture",
    subtitle: "Инструмент в оправе",
    thesis: "Один точный артефакт с восьмигранной апертурой вместо набора карточек.",
    icon: Aperture,
    colors: ["#F3F2ED", "#121719", "#5FAD78", "#C9574F"],
  },
  {
    id: "ledger",
    index: "02",
    name: "Captain’s Ledger",
    subtitle: "Реестр капитана",
    thesis: "Тактический журнал: линейки, печати и короткие полевые пометки.",
    icon: BookOpenText,
    colors: ["#F7F4EC", "#242826", "#3B8B78", "#A47B52"],
  },
  {
    id: "twins",
    index: "03",
    name: "Twin Ancients",
    subtitle: "Между Древними",
    thesis: "Radiant и Dire становятся самой композицией, а рекомендации — мостом.",
    icon: GitCompareArrows,
    colors: ["#F0F3F0", "#171B1F", "#4FA36B", "#C54D4F"],
  },
  {
    id: "wartable",
    index: "04",
    name: "War Table",
    subtitle: "Стол драфтера",
    thesis: "Герои как магнитные фишки на спокойной топографической карте.",
    icon: Map,
    colors: ["#ECEBE2", "#202724", "#56745B", "#B89A5B"],
  },
  {
    id: "signal",
    index: "05",
    name: "Match Signal",
    subtitle: "Эфир матча",
    thesis: "Чистая broadcast-система: полосы, табло и драматургия Match Found.",
    icon: Radio,
    colors: ["#F1F3F4", "#0D1215", "#73A978", "#D0534D"],
  },
];

const screenOptions: { id: Screen; label: string; short: string }[] = [
  { id: "home", label: "Главная", short: "Драфт" },
  { id: "heroes", label: "Выбор героя", short: "Герои" },
  { id: "photo", label: "Проверка фото", short: "Фото" },
  { id: "analysis", label: "Анализ", short: "Loader" },
  { id: "result", label: "Результат", short: "Топ-3" },
  { id: "history", label: "История", short: "История" },
  { id: "profile", label: "Профиль", short: "Профиль" },
  { id: "auth", label: "Вход и регистрация", short: "Вход" },
  { id: "plans", label: "Counterpick Pro", short: "Pro" },
  { id: "states", label: "Состояния", short: "Состояния" },
];

const states: {
  id: StateId;
  label: string;
  title: string;
  body: string;
  action: string;
  kind: "empty" | "warning" | "confirm";
  icon: LucideIcon;
}[] = [
  {
    id: "loading",
    label: "Загрузка",
    title: "Сверяем драфт",
    body: "Проверяем роли, патч и матчи вашего ранга.",
    action: "Остановить",
    kind: "confirm",
    icon: LoaderCircle,
  },
  {
    id: "error",
    label: "Ошибка",
    title: "Анализ не завершён",
    body: "Соединение прервалось. Драфт сохранён — попробуйте ещё раз.",
    action: "Повторить",
    kind: "warning",
    icon: Zap,
  },
  {
    id: "empty",
    label: "Пусто",
    title: "Здесь появятся подборы",
    body: "Соберите первый драфт, чтобы вернуться к нему позже.",
    action: "Начать анализ",
    kind: "empty",
    icon: History,
  },
  {
    id: "no-photo",
    label: "Нет фото",
    title: "Фото не выбрано",
    body: "Добавьте снимок экрана или соберите драфт вручную.",
    action: "Выбрать фото",
    kind: "empty",
    icon: ImageOff,
  },
  {
    id: "limit",
    label: "Лимит",
    title: "Попытки закончились",
    body: "Новый бесплатный анализ будет доступен завтра.",
    action: "Посмотреть Pro",
    kind: "warning",
    icon: Gauge,
  },
  {
    id: "offline",
    label: "Офлайн",
    title: "Результат сохранён офлайн",
    body: "Покажем локальную рекомендацию и обновим её при подключении.",
    action: "Открыть результат",
    kind: "confirm",
    icon: CloudOff,
  },
  {
    id: "delete",
    label: "Удаление",
    title: "Удалить аккаунт?",
    body: "История и настройки исчезнут без возможности восстановления.",
    action: "Удалить",
    kind: "warning",
    icon: Trash2,
  },
];

const recommendations = [
  {
    hero: heroes.find((hero) => hero.id === 52)!,
    score: 92,
    label: "Лучший ответ",
    lane: "Мид · темп и массовый урон",
    reasons: ["Быстро стирает иллюзии PL", "Давит Sniper по темпу"],
    risk: "Hex Lion и Call Axe наказывают за позицию",
  },
  {
    hero: heroes.find((hero) => hero.id === 17)!,
    score: 87,
    label: "Надёжный выбор",
    lane: "Мид · мобильный backline dive",
    reasons: ["Достаёт Sniper и Lion", "Уходит от иллюзий и контроля"],
    risk: "Мгновенный контроль делает ошибку дорогой",
  },
  {
    hero: heroes.find((hero) => hero.id === 120)!,
    score: 83,
    label: "Гибкий план",
    lane: "Мид / сложная · массовый контроль",
    reasons: ["Сбивает позиционку Sniper", "Контролирует иллюзии в драке"],
    risk: "Чувствителен к mana pressure и silence",
  },
];

const historyItems = [
  { id: 1, role: "Мид", title: "Мид против PL + Sniper", picks: "Leshrac · Storm · Pangolier", time: "Сегодня, 12:42", score: 92 },
  { id: 2, role: "Керри", title: "Керри против Medusa", picks: "Anti-Mage · Slark · Ursa", time: "Вчера, 21:16", score: 91 },
  { id: 3, role: "Оффлейн", title: "Оффлейн против PA", picks: "Axe · Timbersaw · LC", time: "20 июля, 18:03", score: 89 },
];

const tabItems: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Драфт", icon: Home },
  { id: "history", label: "История", icon: History },
  { id: "plans", label: "Pro", icon: Star },
  { id: "profile", label: "Профиль", icon: UserRound },
];

function HeroPortrait({ hero, size = "regular" }: { hero: Hero; size?: "small" | "regular" | "large" }) {
  return (
    <span className={`hero-portrait hero-portrait-${size}`}>
      <img src={heroImage(hero.slug)} alt={hero.name} />
    </span>
  );
}

function StateAnimation({ kind }: { kind: "empty" | "warning" | "confirm" }) {
  const animationData =
    kind === "empty" ? emptyPortal : kind === "warning" ? warningRune : confirmRune;

  return (
    <div className={`state-animation state-animation-${kind}`} aria-hidden="true">
      <Lottie animationData={animationData} loop autoplay />
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

function FlowHeader({
  title,
  caption,
  onBack,
  action,
}: {
  title: string;
  caption?: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header className="flow-header">
      <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
        <ChevronLeft size={20} />
      </button>
      <div className="flow-heading">
        <h1>{title}</h1>
        {caption ? <p>{caption}</p> : null}
      </div>
      <div className="flow-action">{action}</div>
    </header>
  );
}

function DraftTeam({
  side,
  title,
  heroes: selected,
  onOpen,
  onRemove,
}: {
  side: Side;
  title: string;
  heroes: Hero[];
  onOpen: (side: Side) => void;
  onRemove: (side: Side, heroId: number) => void;
}) {
  const slots = Array.from({ length: 5 }, (_, index) => selected[index] ?? null);

  return (
    <section className={`draft-team draft-team-${side}`}>
      <div className="team-heading">
        <span className="team-marker" />
        <strong>{title}</strong>
        <span>{selected.length}/5</span>
      </div>
      <div className="hero-slots">
        {slots.map((hero, index) => (
          <div className="hero-slot-wrap" key={hero?.id ?? `${side}-${index}`}>
            <button
              className={`hero-slot ${hero ? "is-filled" : ""}`}
              type="button"
              onClick={() => onOpen(side)}
              aria-label={hero ? `Изменить героя ${hero.name}` : `Добавить героя: ${title}`}
            >
              {hero ? (
                <>
                  <HeroPortrait hero={hero} />
                  <span>{hero.name}</span>
                </>
              ) : (
                <>
                  <Plus size={19} />
                  <span>Слот</span>
                </>
              )}
            </button>
            {hero ? (
              <button
                className="slot-remove"
                type="button"
                onClick={() => onRemove(side, hero.id)}
                aria-label={`Убрать ${hero.name}`}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AppTopBar({
  theme,
  attempts,
  onTheme,
  onHome,
}: {
  theme: ThemeMode;
  attempts: number;
  onTheme: () => void;
  onHome: () => void;
}) {
  return (
    <header className="app-top-bar">
      <button className="brand-button" type="button" onClick={onHome} aria-label="На главную Counterpick">
        <img src="/brand/counterpick-mark.png" alt="" />
        <span>
          <strong>COUNTERPICK</strong>
          <small>Draft companion</small>
        </span>
      </button>
      <div className="top-actions">
        <span className="attempts-chip">
          <Sparkles size={14} />
          {attempts} попытки
        </span>
        <button className="icon-button" type="button" onClick={onTheme} aria-label="Сменить тему">
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </header>
  );
}

function TabBar({
  screen,
  onNavigate,
  designId,
}: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  designId: string;
}) {
  return (
    <nav className={`tab-bar tab-bar-${designId}`} aria-label="Основная навигация">
      {designId === "ledger" ? <span className="nav-architecture-label">CHAPTERS</span> : null}
      {designId === "twins" ? (
        <>
          <span className="nav-architecture-wing nav-architecture-wing-ally">R</span>
          <span className="nav-architecture-wing nav-architecture-wing-enemy">D</span>
        </>
      ) : null}
      {designId === "wartable" ? <span className="nav-compass"><Target size={17} /></span> : null}
      {designId === "signal" ? <span className="nav-live-signal"><i /> LIVE</span> : null}
      {tabItems.map((item) => {
        const Icon = item.icon;
        const active = screen === item.id || (screen === "result" && item.id === "home");
        return (
          <button
            key={item.id}
            className={active ? "is-active" : ""}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} />
            {designId === "ledger" ? <small>0{tabItems.indexOf(item) + 1}</small> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function CounterpickPrototype() {
  const [designId, setDesignId] = useState("aegis");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [screen, setScreen] = useState<Screen>("home");
  const [editingSide, setEditingSide] = useState<Side>("enemy");
  const [allies, setAllies] = useState<Hero[]>([heroes[0], heroes[1]]);
  const [enemies, setEnemies] = useState<Hero[]>(
    [12, 35, 2, 26, 31].map((id) => heroes.find((hero) => hero.id === id)!),
  );
  const [position, setPosition] = useState(2);
  const [rank, setRank] = useState("Legend");
  const [search, setSearch] = useState("");
  const [heroFilter, setHeroFilter] = useState("Все");
  const [historyFilter, setHistoryFilter] = useState("Все");
  const [accepted, setAccepted] = useState(6);
  const [expandedPick, setExpandedPick] = useState(0);
  const [selectedState, setSelectedState] = useState<StateId>("loading");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [annual, setAnnual] = useState(true);
  const [photoName, setPhotoName] = useState("draft-screen.png");
  const [photoUrl, setPhotoUrl] = useState("/brand/battleground.jpg");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const design = designs.find((item) => item.id === designId) ?? designs[0];
  const activeState = states.find((item) => item.id === selectedState) ?? states[0];
  const currentScreen = screenOptions.find((item) => item.id === screen) ?? screenOptions[0];

  const filteredHeroes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    const positionByFilter: Record<string, number[]> = {
      Керри: [1],
      Мид: [2],
      Оффлейн: [3],
      Саппорт: [4, 5],
    };
    return heroes.filter((hero) => {
      const matchesQuery =
        !query ||
        hero.name.toLocaleLowerCase("ru").includes(query) ||
        hero.attribute.toLocaleLowerCase("ru").includes(query) ||
        hero.positions.join(" ").includes(query);
      const positionsForFilter = positionByFilter[heroFilter];
      const matchesFilter =
        !positionsForFilter || hero.positions.some((item) => positionsForFilter.includes(item));
      return matchesQuery && matchesFilter;
    });
  }, [heroFilter, search]);

  useEffect(() => {
    if (screen !== "analysis") return;
    setAccepted(6);
    let value = 6;
    const timer = window.setInterval(() => {
      value += 1;
      setAccepted(Math.min(value, 10));
      if (value >= 10) window.clearInterval(timer);
    }, 520);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = (nextScreen: Screen) => {
    setScreen(nextScreen);
    setSearch("");
  };

  const openHeroSelect = (side: Side) => {
    setEditingSide(side);
    navigate("heroes");
  };

  const removeHero = (side: Side, heroId: number) => {
    if (side === "ally") setAllies((current) => current.filter((hero) => hero.id !== heroId));
    else setEnemies((current) => current.filter((hero) => hero.id !== heroId));
  };

  const toggleHero = (hero: Hero) => {
    const selected = editingSide === "ally" ? allies : enemies;
    const setSelected = editingSide === "ally" ? setAllies : setEnemies;
    if (selected.some((item) => item.id === hero.id)) {
      setSelected(selected.filter((item) => item.id !== hero.id));
      return;
    }
    if (selected.length >= 5) {
      setToast("В команде уже пять героев");
      return;
    }
    setSelected([...selected, hero]);
  };

  const toggleHeroForSide = (side: Side, hero: Hero) => {
    const selected = side === "ally" ? allies : enemies;
    const setSelected = side === "ally" ? setAllies : setEnemies;
    if (selected.some((item) => item.id === hero.id)) {
      setSelected(selected.filter((item) => item.id !== hero.id));
      return;
    }
    if (selected.length >= 5) {
      setToast("В команде уже пять героев");
      return;
    }
    setEditingSide(side);
    if (side === "ally") {
      setEnemies((current) => current.filter((item) => item.id !== hero.id));
    } else {
      setAllies((current) => current.filter((item) => item.id !== hero.id));
    }
    setSelected([...selected, hero]);
  };

  const handlePhoto = (file?: File) => {
    if (!file) return;
    setPhotoName(file.name);
    setPhotoUrl(URL.createObjectURL(file));
    navigate("photo");
  };

  const handleStateAction = () => {
    if (selectedState === "limit") navigate("plans");
    else if (selectedState === "offline") navigate("result");
    else if (selectedState === "empty") navigate("home");
    else if (selectedState === "no-photo") fileInputRef.current?.click();
    else if (selectedState === "delete") {
      setToast("Демо: аккаунт сохранён");
      navigate("profile");
    } else {
      setToast(selectedState === "error" ? "Анализ перезапущен" : "Действие выполнено");
    }
  };

  const renderVariantTeam = (
    list: Hero[],
    side: Side,
    label: string,
    mode: "ledger" | "twins" | "wartable" | "signal",
  ) => {
    const slots = Array.from({ length: 5 }, (_, index) => list[index] ?? null);

    return (
      <section className={`variant-team variant-team-${mode} variant-team-${side}`}>
        <header>
          <span>{label}</span>
          <small>{list.length}/5</small>
        </header>
        <div className="variant-team-slots">
          {slots.map((hero, index) => (
            <div className="variant-slot" key={hero?.id ?? `${mode}-${side}-${index}`}>
              <button
                type="button"
                onClick={() => openHeroSelect(side)}
                aria-label={hero ? `Изменить ${hero.name}` : `Добавить героя: ${label}`}
              >
                {hero ? (
                  <>
                    <HeroPortrait hero={hero} size={mode === "twins" ? "regular" : "small"} />
                    <span>{hero.name}</span>
                  </>
                ) : (
                  <>
                    <Plus size={15} />
                    <span>Пусто</span>
                  </>
                )}
              </button>
              {hero ? (
                <button
                  className="variant-slot-remove"
                  type="button"
                  onClick={() => removeHero(side, hero.id)}
                  aria-label={`Убрать ${hero.name}`}
                >
                  <X size={10} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderVariantPositions = (mode: "ledger" | "twins" | "wartable" | "signal") => (
    <div className={`variant-positions variant-positions-${mode}`} role="group" aria-label="Позиция">
      {[1, 2, 3, 4, 5].map((item) => (
        <button
          className={position === item ? "is-selected" : ""}
          type="button"
          key={item}
          onClick={() => setPosition(item)}
          aria-pressed={position === item}
        >
          <span>{item}</span>
          <small>{["Carry", "Mid", "Off", "Soft", "Hard"][item - 1]}</small>
        </button>
      ))}
    </div>
  );

  const renderLedgerHome = () => (
    <div className="screen screen-home home-ledger">
      <header className="ledger-masthead">
        <button type="button" onClick={() => navigate("home")}>
          <BookOpenText size={18} />
          <span><strong>DRAFT LEDGER</strong><small>Counterpick field notes</small></span>
        </button>
        <span className="ledger-folio">№ 024</span>
        <button
          className="ledger-theme"
          type="button"
          onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
          aria-label="Сменить тему"
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </header>
      <main className="screen-content ledger-home-content">
        <section className="ledger-opening">
          <div>
            <span>CHAPTER I · INPUT</span>
            <h1>Запись нового драфта</h1>
            <p>Сверьте обе ведомости и заверьте подбор.</p>
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <ScanLine size={18} />
            <span><strong>SCAN</strong><small>добавить фото</small></span>
          </button>
        </section>
        <section className="ledger-document">
          <aside className="ledger-margin-index" aria-hidden="true">
            <span>01</span><span>02</span><span>03</span><span>04</span>
          </aside>
          <div className="ledger-document-body">
            <div className="ledger-entry">
              <div className="ledger-entry-label"><i className="ally-dot" />Союзная ведомость</div>
              {renderVariantTeam(allies, "ally", "RADIANT", "ledger")}
            </div>
            <div className="ledger-entry">
              <div className="ledger-entry-label"><i className="enemy-dot" />Вражеская ведомость</div>
              {renderVariantTeam(enemies, "enemy", "DIRE", "ledger")}
            </div>
            <div className="ledger-entry ledger-role-entry">
              <div className="ledger-entry-label">Назначение</div>
              {renderVariantPositions("ledger")}
            </div>
            <div className="ledger-rank-line">
              <span>Пул матчей</span>
              <select value={rank} onChange={(event) => setRank(event.target.value)}>
                {["Любой ранг", "Archon", "Legend", "Ancient", "Divine", "Immortal"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <span>7.41d · 23 JUL</span>
            </div>
          </div>
        </section>
        <button className="ledger-seal-cta" type="button" onClick={() => navigate("analysis")}>
          <span className="ledger-seal"><Shield size={20} /></span>
          <span><small>ЗАВЕРИТЬ ЗАПИСЬ</small><strong>Подобрать три ответа</strong></span>
          <ArrowRight size={18} />
        </button>
      </main>
    </div>
  );

  const renderTwinsHome = () => (
    <div className="screen screen-home home-twins">
      <header className="twins-header">
        <span><i />RADIANT <strong>{allies.length}</strong></span>
        <button type="button" onClick={() => navigate("home")} aria-label="Counterpick">
          <img src="/brand/counterpick-mark.png" alt="" />
        </button>
        <span><strong>{enemies.length}</strong> DIRE<i /></span>
      </header>
      <main className="twins-board">
        <section className="twins-bank twins-bank-ally">
          <div className="twins-bank-heading">
            <span>Ваш берег</span>
            <button type="button" onClick={() => openHeroSelect("ally")}><Plus size={14} /></button>
          </div>
          {renderVariantTeam(allies, "ally", "RADIANT", "twins")}
        </section>
        <section className="twins-river-core">
          <button className="twins-photo-gate" type="button" onClick={() => fileInputRef.current?.click()}>
            <Camera size={19} />
            <span>Фото</span>
          </button>
          <span className="twins-river-line"><i /><i /><i /></span>
          <div className="twins-position-orb">
            <small>POS</small>
            <strong>{position}</strong>
            <span>{rank}</span>
          </div>
          <button className="twins-analyze-gate" type="button" onClick={() => navigate("analysis")}>
            <Sparkles size={18} />
            <span>АНАЛИЗ</span>
          </button>
        </section>
        <section className="twins-bank twins-bank-enemy">
          <div className="twins-bank-heading">
            <button type="button" onClick={() => openHeroSelect("enemy")}><Plus size={14} /></button>
            <span>Чужой берег</span>
          </div>
          {renderVariantTeam(enemies, "enemy", "DIRE", "twins")}
        </section>
        <section className="twins-bridge">
          <div>
            <span>Выберите линию</span>
            {renderVariantPositions("twins")}
          </div>
          <button
            type="button"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label="Сменить тему"
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </section>
      </main>
    </div>
  );

  const renderWarTableHome = () => (
    <div className="screen screen-home home-wartable">
      <header className="wartable-header">
        <button type="button" onClick={() => navigate("home")}>
          <Map size={18} />
          <span><strong>WAR TABLE</strong><small>TACTICAL DRAFT · P{position}</small></span>
        </button>
        <span className="wartable-attempts"><Target size={14} /> 3 хода</span>
        <button
          type="button"
          onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
          aria-label="Сменить тему"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </header>
      <main className="wartable-board">
        <section className="wartable-threat-tray">
          <span>ЦЕЛИ DIRE</span>
          {renderVariantTeam(enemies, "enemy", "Противники", "wartable")}
        </section>
        <section className="wartable-map-field">
          <span className="map-route map-route-one" />
          <span className="map-route map-route-two" />
          <button className="map-scan-compass" type="button" onClick={() => fileInputRef.current?.click()}>
            <span className="map-compass-ring" />
            <Camera size={25} />
            <strong>SCAN DRAFT</strong>
            <small>или расставьте фишки</small>
          </button>
          <div className="wartable-squad-tray">
            <span>ВАШ ОТРЯД</span>
            {renderVariantTeam(allies, "ally", "Союзники", "wartable")}
          </div>
        </section>
        <section className="wartable-tool-drawer">
          <span className="drawer-handle" />
          <div className="wartable-tool-heading">
            <span><small>Инструмент</small><strong>Линия и пул</strong></span>
            <select value={rank} onChange={(event) => setRank(event.target.value)}>
              {["Archon", "Legend", "Ancient", "Divine", "Immortal"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          {renderVariantPositions("wartable")}
          <button className="wartable-launch" type="button" onClick={() => navigate("analysis")}>
            <Target size={18} />
            <span><small>ПРОЛОЖИТЬ МАРШРУТ</small><strong>Три контрпика</strong></span>
            <ArrowRight size={18} />
          </button>
        </section>
      </main>
    </div>
  );

  const renderSignalHome = () => (
    <div className="screen screen-home home-signal">
      <header className="signal-control-header">
        <button type="button" onClick={() => navigate("home")}>
          <Radio size={17} />
          <span><strong>COUNTERPICK LIVE</strong><small>DRAFT CONTROL</small></span>
        </button>
        <span className="signal-live"><i /> ONLINE</span>
        <button
          type="button"
          onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
          aria-label="Сменить тему"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </header>
      <main className="screen-content signal-home-content">
        <section className="signal-headline">
          <span>CH 01 · DRAFT INPUT</span>
          <h1>Кого выпускать в этот матч?</h1>
          <div><small>PATCH</small><strong>7.41d</strong><small>TRIES</small><strong>03</strong></div>
        </section>
        <button className="signal-source-strip" type="button" onClick={() => fileInputRef.current?.click()}>
          <span className="signal-source-icon"><Camera size={19} /></span>
          <span><small>ИСТОЧНИК ДРАФТА</small><strong>Загрузить экран матча</strong></span>
          <span>PHOTO IN <ArrowRight size={16} /></span>
        </button>
        <section className="signal-scoreboard">
          <header>
            <span>TEAM</span>
            {[1, 2, 3, 4, 5].map((item) => <span key={item}>S{item}</span>)}
            <span>EDIT</span>
          </header>
          <div className="signal-team-row signal-team-row-ally">
            <strong>RAD</strong>
            {renderVariantTeam(allies, "ally", "RADIANT", "signal")}
            <button type="button" onClick={() => openHeroSelect("ally")}><Plus size={14} /></button>
          </div>
          <div className="signal-team-row signal-team-row-enemy">
            <strong>DIRE</strong>
            {renderVariantTeam(enemies, "enemy", "DIRE", "signal")}
            <button type="button" onClick={() => openHeroSelect("enemy")}><Plus size={14} /></button>
          </div>
        </section>
        <section className="signal-control-deck">
          <div className="signal-control-label">
            <span>ROLE SELECT</span>
            <span>RANK POOL · {rank}</span>
          </div>
          {renderVariantPositions("signal")}
          <div className="signal-rank-action">
            <select value={rank} onChange={(event) => setRank(event.target.value)}>
              {["Archon", "Legend", "Ancient", "Divine", "Immortal"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button type="button" onClick={() => navigate("analysis")}>
              RUN COUNTERPICK <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <div className="signal-ticker">
          <span>META UPDATED 23 JUL</span><i /><span>{enemies.length} ENEMIES LOCKED</span><i /><span>READY</span>
        </div>
      </main>
    </div>
  );

  const renderHome = () => (
    <div className="screen screen-home">
      <AppTopBar
        theme={theme}
        attempts={3}
        onTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        onHome={() => navigate("home")}
      />
      <main className="screen-content">
        <section className="home-intro">
          <span className="signal-line">
            <span />
            Патч 7.41d · мета 23 июля
          </span>
          <h1>Найдём пик, который меняет драфт.</h1>
          <p>Фото или ручной состав — три понятных ответа с рисками.</p>
        </section>

        <section className="photo-aperture">
          <div className="photo-art" aria-hidden="true">
            <img src="/brand/battleground.jpg" alt="" />
            <span className="scan-corner scan-corner-one" />
            <span className="scan-corner scan-corner-two" />
            <span className="scan-beam" />
          </div>
          <div className="photo-copy">
            <span className="eyebrow">Быстрый анализ</span>
            <strong>Сканировать экран</strong>
            <p>Распознаем героев и предложим проверить драфт.</p>
            <div className="photo-actions">
              <button className="compact-button" type="button" onClick={() => fileInputRef.current?.click()}>
                <Camera size={17} />
                Выбрать фото
              </button>
              <button className="text-button" type="button" onClick={() => navigate("photo")}>
                Демо-кадр
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>

        <section className="draft-panel panel">
          <SectionTitle
            eyebrow="Ручной режим"
            title="Соберите драфт"
            aside={
              <button className="tiny-action" type="button" onClick={() => {
                setAllies([]);
                setEnemies([]);
              }}>
                Очистить
              </button>
            }
          />
          <DraftTeam
            side="ally"
            title="Союзники"
            heroes={allies}
            onOpen={openHeroSelect}
            onRemove={removeHero}
          />
          <div className="draft-river">
            <span>RADIANT</span>
            <i />
            <span>DIRE</span>
          </div>
          <DraftTeam
            side="enemy"
            title="Противники"
            heroes={enemies}
            onOpen={openHeroSelect}
            onRemove={removeHero}
          />
        </section>

        <section className="controls-panel panel">
          <SectionTitle eyebrow="Ваш герой" title="Позиция и ранг" />
          <div className="position-picker" role="group" aria-label="Выберите позицию">
            {[1, 2, 3, 4, 5].map((item) => (
              <button
                key={item}
                className={position === item ? "is-selected" : ""}
                type="button"
                onClick={() => setPosition(item)}
                aria-pressed={position === item}
              >
                <span>{item}</span>
                <small>{["Керри", "Мид", "Офф", "Сап", "Фулл"][item - 1]}</small>
              </button>
            ))}
          </div>
          <label className="select-field">
            <span>Ранг</span>
            <select value={rank} onChange={(event) => setRank(event.target.value)}>
              {["Любой ранг", "Archon", "Legend", "Ancient", "Divine", "Immortal"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </section>

        <button
          className="primary-cta"
          type="button"
          onClick={() => navigate("analysis")}
          disabled={!position || enemies.length === 0}
        >
          <span className="cta-icon">
            <Sparkles size={19} />
          </span>
          <span>
            <strong>Подобрать контрпики</strong>
            <small>Враги: {enemies.length} · позиция {position} · {rank}</small>
          </span>
          <ArrowRight size={19} />
        </button>
      </main>
    </div>
  );

  const renderHeroSearch = (className = "") => (
    <>
      <label className={`search-field ${className}`}>
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Герой, роль или позиция"
        />
        {search ? (
          <button type="button" onClick={() => setSearch("")} aria-label="Очистить поиск">
            <X size={16} />
          </button>
        ) : null}
      </label>
      <div className="filter-row" aria-label="Быстрые фильтры">
        {["Все", "Керри", "Мид", "Оффлейн", "Саппорт"].map((item) => (
          <button
            className={heroFilter === item ? "is-selected" : ""}
            type="button"
            key={item}
            onClick={() => setHeroFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </>
  );

  const renderLedgerHeroes = () => {
    const selected = editingSide === "ally" ? allies : enemies;
    return (
      <div className="screen screen-heroes heroes-ledger">
        <FlowHeader
          title="Реестр героев"
          caption={`Лист 02 · ${selected.length}/5 отмечено`}
          onBack={() => navigate("home")}
          action={<span className="ledger-page-stamp">7.41d</span>}
        />
        <main className="screen-content ledger-hero-sheet">
          <div className="ledger-roster-switch" role="group" aria-label="Ведомость команды">
            <button
              className={editingSide === "ally" ? "is-selected" : ""}
              type="button"
              onClick={() => setEditingSide("ally")}
            >
              <span>01</span> Ведомость Radiant <strong>{allies.length}</strong>
            </button>
            <button
              className={editingSide === "enemy" ? "is-selected" : ""}
              type="button"
              onClick={() => setEditingSide("enemy")}
            >
              <span>02</span> Ведомость Dire <strong>{enemies.length}</strong>
            </button>
          </div>
          <section className="ledger-query-line">
            {renderHeroSearch("ledger-search")}
          </section>
          <div className="ledger-register-head">
            <span>№</span><span>Персонаж</span><span>Позиции</span><span>Статус</span>
          </div>
          <ol className="ledger-hero-register">
            {filteredHeroes.map((hero, index) => {
              const active = selected.some((item) => item.id === hero.id);
              return (
                <li key={hero.id}>
                  <button
                    className={active ? "is-selected" : ""}
                    type="button"
                    onClick={() => toggleHero(hero)}
                    aria-pressed={active}
                  >
                    <span className="ledger-row-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="ledger-hero-name">
                      <HeroPortrait hero={hero} size="small" />
                      <span><strong>{hero.name}</strong><small>{hero.attribute}</small></span>
                    </span>
                    <span className="ledger-positions">P{hero.positions.join(" / ")}</span>
                    <span className="ledger-checkbox">{active ? <Check size={13} /> : <Plus size={13} />}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <button className="ledger-register-done" type="button" onClick={() => navigate("home")}>
            <BadgeCheck size={17} />
            Заверить ведомость
          </button>
        </main>
      </div>
    );
  };

  const renderTwinsHeroes = () => (
    <div className="screen screen-heroes heroes-twins">
      <header className="twins-picker-header">
        <button
          className={editingSide === "ally" ? "is-selected" : ""}
          type="button"
          onClick={() => setEditingSide("ally")}
        >
          <span>RADIANT</span><strong>{allies.length}/5</strong>
        </button>
        <button type="button" onClick={() => navigate("home")} aria-label="Вернуться к драфту">
          <ChevronLeft size={18} /><span>РЕКА ГЕРОЕВ</span>
        </button>
        <button
          className={editingSide === "enemy" ? "is-selected" : ""}
          type="button"
          onClick={() => setEditingSide("enemy")}
        >
          <strong>{enemies.length}/5</strong><span>DIRE</span>
        </button>
      </header>
      <main className="screen-content twins-hero-picker">
        <div className="twins-search-bridge">{renderHeroSearch("twins-search")}</div>
        <div className="twins-hero-river-list">
          {filteredHeroes.map((hero) => {
            const allyActive = allies.some((item) => item.id === hero.id);
            const enemyActive = enemies.some((item) => item.id === hero.id);
            return (
              <article key={hero.id}>
                <button
                  className={`twins-bank-pick twins-bank-pick-ally ${allyActive ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => toggleHeroForSide("ally", hero)}
                  aria-pressed={allyActive}
                >
                  {allyActive ? <Check size={14} /> : <Plus size={14} />}
                  <span>RAD</span>
                </button>
                <div className="twins-river-hero">
                  <HeroPortrait hero={hero} />
                  <span><strong>{hero.name}</strong><small>POS {hero.positions.join(" · ")}</small></span>
                </div>
                <button
                  className={`twins-bank-pick twins-bank-pick-enemy ${enemyActive ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => toggleHeroForSide("enemy", hero)}
                  aria-pressed={enemyActive}
                >
                  <span>DIRE</span>
                  {enemyActive ? <Check size={14} /> : <Plus size={14} />}
                </button>
              </article>
            );
          })}
        </div>
        <button className="twins-picker-done" type="button" onClick={() => navigate("home")}>
          Соединить берега <ArrowRight size={17} />
        </button>
      </main>
    </div>
  );

  const renderWarTableHeroes = () => {
    const selected = editingSide === "ally" ? allies : enemies;
    return (
      <div className="screen screen-heroes heroes-wartable">
        <div className="wartable-picker-map" aria-hidden="true">
          <span /><span /><span />
        </div>
        <header className="wartable-picker-toolbar">
          <button type="button" onClick={() => navigate("home")}><ChevronLeft size={18} /></button>
          <span><small>РАЗМЕЩЕНИЕ ФИШКИ</small><strong>{editingSide === "ally" ? "Сектор Radiant" : "Сектор Dire"}</strong></span>
          <strong>{selected.length}/5</strong>
        </header>
        <main className="wartable-token-drawer">
          <span className="drawer-handle" />
          <div className="wartable-side-toggle">
            <button className={editingSide === "ally" ? "is-selected" : ""} type="button" onClick={() => setEditingSide("ally")}>Союзники</button>
            <button className={editingSide === "enemy" ? "is-selected" : ""} type="button" onClick={() => setEditingSide("enemy")}>Цели</button>
          </div>
          {renderHeroSearch("wartable-search")}
          <div className="wartable-token-grid">
            {filteredHeroes.map((hero) => {
              const active = selected.some((item) => item.id === hero.id);
              return (
                <button
                  className={active ? "is-selected" : ""}
                  type="button"
                  key={hero.id}
                  onClick={() => toggleHero(hero)}
                  aria-pressed={active}
                >
                  <span className="wartable-token-ring"><HeroPortrait hero={hero} /></span>
                  <strong>{hero.name}</strong>
                  <small>P{hero.positions.join("/")}</small>
                  <i>{active ? <Check size={12} /> : <Plus size={12} />}</i>
                </button>
              );
            })}
          </div>
          <button className="wartable-drawer-done" type="button" onClick={() => navigate("home")}>
            <Map size={17} /> Вернуться к карте
          </button>
        </main>
      </div>
    );
  };

  const renderSignalHeroes = () => {
    const selected = editingSide === "ally" ? allies : enemies;
    return (
      <div className="screen screen-heroes heroes-signal">
        <header className="signal-roster-header">
          <button type="button" onClick={() => navigate("home")}><ChevronLeft size={17} /> DRAFT</button>
          <span><i /> ROSTER LIVE</span>
          <strong>{selected.length}/5 LOCKED</strong>
        </header>
        <main className="signal-roster-console">
          <section className="signal-roster-query">
            <div className="signal-side-tabs" role="group">
              <button className={editingSide === "ally" ? "is-selected" : ""} type="button" onClick={() => setEditingSide("ally")}>RAD</button>
              <button className={editingSide === "enemy" ? "is-selected" : ""} type="button" onClick={() => setEditingSide("enemy")}>DIRE</button>
            </div>
            {renderHeroSearch("signal-search")}
          </section>
          <div className="signal-roster-wall">
            {filteredHeroes.map((hero, index) => {
              const active = selected.some((item) => item.id === hero.id);
              return (
                <button
                  className={active ? "is-selected" : ""}
                  type="button"
                  key={hero.id}
                  onClick={() => toggleHero(hero)}
                  aria-pressed={active}
                >
                  <HeroPortrait hero={hero} size="large" />
                  <span className="signal-roster-number">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{hero.name}</strong><small>P{hero.positions.join("/")}</small></span>
                  <i>{active ? <Check size={13} /> : <Plus size={13} />}</i>
                </button>
              );
            })}
          </div>
          <footer className="signal-roster-lower-third">
            <span><small>ACTIVE CHANNEL</small><strong>{editingSide === "ally" ? "RADIANT" : "DIRE"} ROSTER</strong></span>
            <button type="button" onClick={() => navigate("home")}>TAKE DRAFT <ArrowRight size={16} /></button>
          </footer>
        </main>
      </div>
    );
  };

  const renderHeroes = () => {
    const selected = editingSide === "ally" ? allies : enemies;
    return (
      <div className="screen screen-heroes">
        <FlowHeader
          title="Выбор героя"
          caption={`${selected.length}/5 · ${editingSide === "ally" ? "союзники" : "противники"}`}
          onBack={() => navigate("home")}
          action={
            <button className="header-done" type="button" onClick={() => navigate("home")}>
              Готово
            </button>
          }
        />
        <main className="screen-content">
          <div className="side-switch" role="group" aria-label="Сторона драфта">
            <button
              className={editingSide === "ally" ? "is-selected" : ""}
              type="button"
              onClick={() => setEditingSide("ally")}
            >
              Radiant
            </button>
            <button
              className={editingSide === "enemy" ? "is-selected" : ""}
              type="button"
              onClick={() => setEditingSide("enemy")}
            >
              Dire
            </button>
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти героя, роль или позицию"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Очистить поиск">
                <X size={16} />
              </button>
            ) : null}
          </label>
          <div className="filter-row" aria-label="Быстрые фильтры">
            {["Все", "Керри", "Мид", "Оффлейн", "Саппорт"].map((item) => (
              <button
                className={heroFilter === item ? "is-selected" : ""}
                type="button"
                key={item}
                onClick={() => setHeroFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="hero-catalog">
            {filteredHeroes.map((hero) => {
              const active = selected.some((item) => item.id === hero.id);
              return (
                <button
                  className={`hero-card ${active ? "is-selected" : ""}`}
                  type="button"
                  key={hero.id}
                  onClick={() => toggleHero(hero)}
                  aria-pressed={active}
                >
                  <HeroPortrait hero={hero} size="large" />
                  <span className="hero-card-copy">
                    <strong>{hero.name}</strong>
                    <small>{hero.attribute} · поз. {hero.positions.join(", ")}</small>
                  </span>
                  <span className="hero-check">{active ? <Check size={15} /> : <Plus size={15} />}</span>
                </button>
              );
            })}
          </div>
          {filteredHeroes.length === 0 ? (
            <div className="inline-empty">
              <StateAnimation kind="empty" />
              <strong>Герой не найден</strong>
              <button className="text-button" type="button" onClick={() => setSearch("")}>
                Сбросить поиск
              </button>
            </div>
          ) : null}
        </main>
      </div>
    );
  };

  const renderLedgerPhoto = () => {
    const manifest = [
      ...Array.from({ length: 5 }, (_, index) => ({ hero: allies[index], side: "RAD", index })),
      ...Array.from({ length: 5 }, (_, index) => ({ hero: enemies[index], side: "DIRE", index })),
    ];
    return (
      <div className="screen screen-photo photo-ledger">
        <FlowHeader
          title="Акт распознавания"
          caption="Приложение № 01 · проверка фото"
          onBack={() => navigate("home")}
          action={<span className="ledger-page-stamp">88% AVG</span>}
        />
        <main className="screen-content ledger-photo-dossier">
          <figure className="ledger-evidence">
            <span className="ledger-clip"><span /></span>
            <img src={photoUrl} alt={`Фото драфта ${photoName}`} />
            <figcaption><span>ВЛОЖЕНИЕ A</span><strong>{photoName}</strong></figcaption>
            <button type="button" onClick={() => fileInputRef.current?.click()}>Заменить</button>
          </figure>
          <section className="ledger-manifest">
            <header><span>СТР.</span><span>СТОРОНА / ГЕРОЙ</span><span>CONF.</span><span>ПРАВКА</span></header>
            {manifest.map((item, index) => {
              const confidence = index === 7 ? 62 : 96 - index;
              return (
                <button
                  className={confidence < 70 ? "is-uncertain" : ""}
                  type="button"
                  key={`${item.side}-${item.index}`}
                  onClick={() => openHeroSelect(item.side === "RAD" ? "ally" : "enemy")}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    {item.hero ? <HeroPortrait hero={item.hero} size="small" /> : <i className="ledger-empty-mark">—</i>}
                    <span><small>{item.side}</small><strong>{item.hero?.name ?? "Не определён"}</strong></span>
                  </span>
                  <strong>{item.hero ? `${confidence}%` : "—"}</strong>
                  <ChevronRight size={15} />
                </button>
              );
            })}
          </section>
          <button className="ledger-confirm-record" type="button" onClick={() => navigate("analysis")}>
            <span className="ledger-seal"><Check size={18} /></span>
            <span><small>ПРОВЕРЕНО КАПИТАНОМ</small><strong>Перейти к сверке</strong></span>
            <ArrowRight size={17} />
          </button>
        </main>
      </div>
    );
  };

  const renderTwinsPhoto = () => (
    <div className="screen screen-photo photo-twins">
      <header className="twins-photo-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={18} /></button>
        <span><small>РАЗДЕЛЕНИЕ КАДРА</small><strong>Radiant / Dire</strong></span>
        <span>88%</span>
      </header>
      <main className="twins-photo-review">
        <figure className="twins-split-photo">
          <img src={photoUrl} alt={`Фото драфта ${photoName}`} />
          <span className="twins-photo-bank twins-photo-bank-ally">RADIANT</span>
          <span className="twins-photo-divider"><i /><strong>VS</strong><i /></span>
          <span className="twins-photo-bank twins-photo-bank-enemy">DIRE</span>
          <button className="twins-uncertain-token" type="button" onClick={() => openHeroSelect("enemy")}>
            <AlertTriangle size={14} /><strong>62%</strong><small>исправить</small>
          </button>
          <figcaption>{photoName}</figcaption>
        </figure>
        <section className="twins-recognized-matrix">
          <header><span>ВАШ БЕРЕГ</span><strong>ПОЗ.</strong><span>ЧУЖОЙ БЕРЕГ</span></header>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index}>
              <button type="button" onClick={() => openHeroSelect("ally")}>
                {allies[index] ? <><HeroPortrait hero={allies[index]} size="small" /><span>{allies[index].name}</span></> : <><Plus size={13} /><span>Пусто</span></>}
              </button>
              <span>{index + 1}</span>
              <button type="button" onClick={() => openHeroSelect("enemy")}>
                {enemies[index] ? <><span>{enemies[index].name}</span><HeroPortrait hero={enemies[index]} size="small" /></> : <><span>Пусто</span><Plus size={13} /></>}
              </button>
            </div>
          ))}
        </section>
        <button className="twins-confirm-bridge" type="button" onClick={() => navigate("analysis")}>
          <Check size={17} /> Соединить обе стороны <ArrowRight size={17} />
        </button>
      </main>
    </div>
  );

  const renderWarTablePhoto = () => {
    const detections = [...allies, ...enemies].slice(0, 7);
    return (
      <div className="screen screen-photo photo-wartable">
        <header className="wartable-recon-header">
          <button type="button" onClick={() => navigate("home")}><ChevronLeft size={18} /></button>
          <span><small>РАЗВЕДДАННЫЕ</small><strong>Кадр 01 · {detections.length} целей</strong></span>
          <button type="button" onClick={() => fileInputRef.current?.click()}><Camera size={17} /></button>
        </header>
        <main className="wartable-recon-board">
          <figure className="wartable-recon-sheet">
            <span className="recon-tape recon-tape-left" />
            <span className="recon-tape recon-tape-right" />
            <img src={photoUrl} alt={`Разведывательный кадр ${photoName}`} />
            {detections.map((hero, index) => (
              <button
                className={index === 6 ? "is-uncertain" : ""}
                type="button"
                key={hero.id}
                style={{ left: `${14 + (index % 4) * 23}%`, top: `${24 + Math.floor(index / 4) * 39}%` }}
                onClick={() => openHeroSelect(index < allies.length ? "ally" : "enemy")}
                aria-label={`Исправить ${hero.name}`}
              >
                {index + 1}
              </button>
            ))}
            <figcaption><Target size={13} /> {photoName}</figcaption>
          </figure>
          <section className="wartable-recon-manifest">
            <header><span>МАНИФЕСТ ФИШЕК</span><strong>88% AVG</strong></header>
            <div>
              {detections.map((hero, index) => (
                <button type="button" key={hero.id} onClick={() => openHeroSelect(index < allies.length ? "ally" : "enemy")}>
                  <span>{index + 1}</span>
                  <HeroPortrait hero={hero} size="small" />
                  <strong>{hero.name}</strong>
                  <small>{index === 6 ? "62%" : `${95 - index}%`}</small>
                </button>
              ))}
            </div>
          </section>
          <button className="wartable-recon-confirm" type="button" onClick={() => navigate("analysis")}>
            <Map size={17} /> Перенести фишки на стол <ArrowRight size={17} />
          </button>
        </main>
      </div>
    );
  };

  const renderSignalPhoto = () => (
    <div className="screen screen-photo photo-signal">
      <header className="signal-photo-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={17} /> INPUT</button>
        <span><i /> VISION FEED 01</span>
        <strong>88%</strong>
      </header>
      <main className="signal-photo-console">
        <figure className="signal-broadcast-frame">
          <img src={photoUrl} alt={`Кадр матча ${photoName}`} />
          <span className="signal-corner signal-corner-one" />
          <span className="signal-corner signal-corner-two" />
          <span className="signal-corner signal-corner-three" />
          <span className="signal-corner signal-corner-four" />
          <span className="signal-detection-label signal-detection-label-one">RAD · CM · 96</span>
          <span className="signal-detection-label signal-detection-label-two">DIRE · PL · 94</span>
          <button className="signal-detection-error" type="button" onClick={() => openHeroSelect("enemy")}>UNKNOWN · 62 <AlertTriangle size={13} /></button>
          <figcaption><span>LIVE CAPTURE</span>{photoName}</figcaption>
        </figure>
        <section className="signal-photo-scoreboard">
          <div>
            <strong>RAD</strong>
            {Array.from({ length: 5 }, (_, index) => (
              <button type="button" key={index} onClick={() => openHeroSelect("ally")}>
                {allies[index] ? <HeroPortrait hero={allies[index]} size="small" /> : <Plus size={13} />}
              </button>
            ))}
            <span>{allies.length}</span>
          </div>
          <div>
            <strong>DIRE</strong>
            {Array.from({ length: 5 }, (_, index) => (
              <button type="button" key={index} onClick={() => openHeroSelect("enemy")}>
                {enemies[index] ? <HeroPortrait hero={enemies[index]} size="small" /> : <Plus size={13} />}
              </button>
            ))}
            <span>{enemies.length}</span>
          </div>
        </section>
        <footer className="signal-photo-lower-third">
          <span><small>RECOGNITION STATUS</small><strong>7 CONFIRMED · 1 REVIEW</strong></span>
          <button type="button" onClick={() => navigate("analysis")}>CONFIRM FEED <ArrowRight size={16} /></button>
        </footer>
      </main>
    </div>
  );

  const renderPhoto = () => (
    <div className="screen screen-photo">
      <FlowHeader
        title="Проверка фото"
        caption="Исправьте ошибки перед анализом"
        onBack={() => navigate("home")}
        action={
          <span className="confidence-badge">
            <ScanLine size={14} />
            88%
          </span>
        }
      />
      <main className="screen-content">
        <section className="photo-review-frame">
          <img src={photoUrl} alt={`Загруженный драфт: ${photoName}`} />
          <span className="recognition-box recognition-box-one">CM · 96%</span>
            <span className="recognition-box recognition-box-two">PL · 94%</span>
          <span className="recognition-box recognition-box-error">? · 62%</span>
          <span className="photo-file-name">{photoName}</span>
        </section>
        <section className="recognition-summary">
          <div>
            <CheckCircle2 size={17} />
            <span>
              <strong>7 героев распознано</strong>
              <small>Один слот требует проверки</small>
            </span>
          </div>
          <button className="tiny-action" type="button" onClick={() => fileInputRef.current?.click()}>
            Другое фото
          </button>
        </section>
        <section className="panel recognized-draft">
          <SectionTitle eyebrow="Распознано" title="Сверьте состав" />
          <DraftTeam
            side="ally"
            title="Союзники"
            heroes={allies}
            onOpen={openHeroSelect}
            onRemove={removeHero}
          />
          <DraftTeam
            side="enemy"
            title="Противники"
            heroes={enemies}
            onOpen={openHeroSelect}
            onRemove={removeHero}
          />
          <button className="recognition-warning" type="button" onClick={() => openHeroSelect("enemy")}>
            <AlertTriangle size={18} />
            <span>
              <strong>Не уверены в третьем противнике</strong>
              <small>Нажмите, чтобы заменить героя</small>
            </span>
            <ChevronRight size={18} />
          </button>
        </section>
        <button
          className="primary-cta"
          type="button"
          onClick={() => {
            setToast("Драфт подтверждён");
            navigate("analysis");
          }}
        >
          <span className="cta-icon"><Check size={19} /></span>
          <span>
            <strong>Драфт верный</strong>
            <small>Перейти к анализу</small>
          </span>
          <ArrowRight size={19} />
        </button>
      </main>
    </div>
  );

  const renderLedgerAnalysis = () => (
    <div className="screen screen-analysis analysis-ledger">
      <header className="ledger-analysis-header">
        <span><BookOpenText size={17} /> VALIDATION RECORD</span>
        <strong>№ 024-A</strong>
      </header>
      <main className="ledger-ready-sheet">
        <section className="ledger-ready-heading">
          <span>CHAPTER III · CROSS-CHECK</span>
          <h1>{accepted === 10 ? "Запись заверена" : "Сверяем десять пунктов"}</h1>
          <p>Герои, позиция, ранг и мета проходят отдельную строку проверки.</p>
        </section>
        <div className="ledger-ready-columns">
          {[
            { label: "RADIANT FILE", offset: 0 },
            { label: "DIRE FILE", offset: 5 },
          ].map((column) => (
            <section key={column.label}>
              <header><span>{column.label}</span><strong>{Math.min(5, Math.max(0, accepted - column.offset))}/5</strong></header>
              <ol>
                {Array.from({ length: 5 }, (_, index) => {
                  const globalIndex = index + column.offset;
                  const complete = globalIndex < accepted;
                  return (
                    <li className={complete ? "is-accepted" : ""} key={index}>
                      <span>{String(globalIndex + 1).padStart(2, "0")}</span>
                      <span><strong>{["Состав", "Роли", "Линия", "Мета", "Матчап"][index]}</strong><small>{complete ? "проверено" : "ожидает"}</small></span>
                      <i>{complete ? <Check size={13} /> : "·"}</i>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
        <section className="ledger-audit-trail">
          <span><small>POSITION</small><strong>0{position}</strong></span>
          <span><small>RANK POOL</small><strong>{rank}</strong></span>
          <span><small>PATCH</small><strong>7.41d</strong></span>
          <span><small>PROGRESS</small><strong>{accepted * 10}%</strong></span>
        </section>
        {accepted === 10 ? (
          <button className="ledger-analysis-seal" type="button" onClick={() => navigate("result")}>
            <span><BadgeCheck size={21} /></span>
            <strong>Открыть заключение</strong>
            <ArrowRight size={17} />
          </button>
        ) : (
          <button className="ledger-analysis-cancel" type="button" onClick={() => navigate("home")}>Аннулировать запись</button>
        )}
      </main>
    </div>
  );

  const renderTwinsAnalysis = () => (
    <div className="screen screen-analysis analysis-twins">
      <main className={`twins-ready-check ${accepted === 10 ? "is-complete" : ""}`}>
        <section className="twins-analysis-bank twins-analysis-bank-ally">
          <header><i /><span><small>ДРЕВНИЙ</small><strong>RADIANT</strong></span></header>
          <div>
            {Array.from({ length: 5 }, (_, index) => {
              const complete = index * 2 < accepted;
              return <span className={complete ? "is-accepted" : ""} key={index}>{complete ? <Check size={14} /> : index + 1}</span>;
            })}
          </div>
          <small>{Math.min(5, Math.ceil(accepted / 2))} принято</small>
        </section>
        <section className="twins-analysis-river">
          <span className="twins-analysis-current"><i style={{ height: `${accepted * 10}%` }} /></span>
          <div>
            <small>MATCH FOUND</small>
            <strong>{accepted}<span>/10</span></strong>
            <p>{accepted === 10 ? "Берега соединены" : "Подтверждения сходятся"}</p>
          </div>
          {accepted === 10 ? (
            <button type="button" onClick={() => navigate("result")}>ПЕРЕЙТИ ПО МОСТУ <ArrowRight size={16} /></button>
          ) : (
            <button type="button" onClick={() => navigate("home")}>Отмена</button>
          )}
        </section>
        <section className="twins-analysis-bank twins-analysis-bank-enemy">
          <header><span><small>ДРЕВНИЙ</small><strong>DIRE</strong></span><i /></header>
          <div>
            {Array.from({ length: 5 }, (_, index) => {
              const complete = index * 2 + 1 < accepted;
              return <span className={complete ? "is-accepted" : ""} key={index}>{complete ? <Check size={14} /> : index + 6}</span>;
            })}
          </div>
          <small>{Math.min(5, Math.floor(accepted / 2))} принято</small>
        </section>
      </main>
    </div>
  );

  const renderWarTableAnalysis = () => (
    <div className="screen screen-analysis analysis-wartable">
      <header className="wartable-analysis-header">
        <span><Target size={16} /> ACTIVE SCAN</span>
        <span>P{position} · {rank} · 7.41d</span>
      </header>
      <main className={`wartable-ready-table ${accepted === 10 ? "is-complete" : ""}`}>
        <div className="wartable-radar">
          <span className="wartable-radar-sweep" />
          <span className="wartable-crosshair" />
          {Array.from({ length: 10 }, (_, index) => (
            <span
              className={`wartable-player-socket ${index < accepted ? "is-accepted" : ""}`}
              style={{ transform: `rotate(${index * 36}deg) translateY(-112px)` }}
              key={index}
            >
              <i style={{ transform: `rotate(${-index * 36}deg)` }}>
                {index < accepted ? <Check size={13} /> : index + 1}
              </i>
            </span>
          ))}
          <div className="wartable-ready-counter">
            <small>MATCH FOUND</small>
            <strong>{accepted}/10</strong>
            <span>{accepted === 10 ? "Стол готов" : "Сканируем маршрут"}</span>
          </div>
        </div>
        <div className="wartable-analysis-route">
          {["DRAFT", "META", "MATCHUP"].map((item, index) => (
            <span className={accepted >= 7 + index ? "is-active" : ""} key={item}>
              <i>{accepted >= 7 + index ? <Check size={11} /> : index + 1}</i>{item}
            </span>
          ))}
        </div>
        {accepted === 10 ? (
          <button className="wartable-report-button" type="button" onClick={() => navigate("result")}>
            <Map size={17} /> Открыть полевой отчёт <ArrowRight size={17} />
          </button>
        ) : (
          <button className="wartable-analysis-cancel" type="button" onClick={() => navigate("home")}>Свернуть карту</button>
        )}
      </main>
    </div>
  );

  const renderSignalAnalysis = () => (
    <div className="screen screen-analysis analysis-signal">
      <header className="signal-analysis-header">
        <span><i /> MATCH FOUND</span>
        <strong>READY CHECK · 7.41d</strong>
      </header>
      <main className="signal-ready-stage">
        <section className="signal-ready-score">
          <span><small>RADIANT</small><strong>{Math.min(5, Math.ceil(accepted / 2))}</strong></span>
          <div><small>ACCEPTED</small><strong>{accepted}<i>/10</i></strong><span>{accepted === 10 ? "ALL PLAYERS READY" : "WAITING FOR PLAYERS"}</span></div>
          <span><small>DIRE</small><strong>{Math.min(5, Math.floor(accepted / 2))}</strong></span>
        </section>
        <div className="signal-ready-grid">
          {Array.from({ length: 10 }, (_, index) => (
            <span className={index < accepted ? "is-accepted" : ""} key={index}>
              <small>{index < 5 ? "RAD" : "DIRE"} {index % 5 + 1}</small>
              <strong>{index < accepted ? <Check size={17} /> : "—"}</strong>
              <i>{index < accepted ? "LOCKED" : "WAIT"}</i>
            </span>
          ))}
        </div>
        <div className="signal-analysis-ticker">
          <span>POSITION {position}</span><i /><span>{rank.toUpperCase()} POOL</span><i /><span>META LIVE</span>
        </div>
        {accepted === 10 ? (
          <button className="signal-take-result" type="button" onClick={() => navigate("result")}>
            TAKE RECOMMENDATIONS <ArrowRight size={18} />
          </button>
        ) : (
          <button className="signal-drop-result" type="button" onClick={() => navigate("home")}>DECLINE</button>
        )}
      </main>
    </div>
  );

  const renderAnalysis = () => (
    <div className="screen screen-analysis">
      <div className="analysis-atmosphere" aria-hidden="true">
        <span className="ancient ancient-radiant" />
        <span className="ancient ancient-dire" />
        <span className="analysis-river" />
      </div>
      <main className="analysis-dialog">
        <div className="analysis-kicker">
          <ScanLine size={15} />
          ANALYSIS READY CHECK
        </div>
        <div className={`match-aperture ${accepted === 10 ? "is-ready" : ""}`}>
          <span className="aperture-ring aperture-ring-one" />
          <span className="aperture-ring aperture-ring-two" />
          <img src="/brand/draft-sigil.png" alt="" />
          <strong>{accepted}/10</strong>
        </div>
        <h1>{accepted === 10 ? "Драфт принят" : "Анализ найден"}</h1>
        <p>
          {accepted === 10
            ? "Три контрпика готовы. Сверили мету, позицию и ваш ранг."
            : "Игроки подтверждают драфт. Сверяем линии и матчапы."}
        </p>
        <div className="accepted-grid" aria-label={`${accepted} из 10 проверок завершено`}>
          {Array.from({ length: 10 }, (_, index) => (
            <span className={index < accepted ? "is-accepted" : ""} key={index}>
              {index < accepted ? <Check size={14} /> : index + 1}
            </span>
          ))}
        </div>
        <div className="analysis-status">
          <span style={{ width: `${accepted * 10}%` }} />
        </div>
        <div className="analysis-meta">
          <span>Позиция {position}</span>
          <i />
          <span>{rank}</span>
          <i />
          <span>патч 7.41d</span>
        </div>
        {accepted === 10 ? (
          <button className="match-ready-button" type="button" onClick={() => navigate("result")}>
            Принять рекомендации
            <ArrowRight size={18} />
          </button>
        ) : (
          <button className="analysis-cancel" type="button" onClick={() => navigate("home")}>
            Отменить
          </button>
        )}
      </main>
    </div>
  );

  const renderLedgerResult = () => (
    <div className="screen screen-result result-ledger">
      <FlowHeader
        title="Заключение капитана"
        caption="Запись № 024 · позиция 02"
        onBack={() => navigate("home")}
        action={<span className="ledger-page-stamp">SEALED</span>}
      />
      <main className="screen-content ledger-result-sheet">
        <section className="ledger-result-heading">
          <span>CHAPTER IV · FINDINGS</span>
          <h1>Три ответа в сравнении</h1>
          <p>Fit, сильные стороны и риск сведены в один лист — без скрытых карточек.</p>
        </section>
        <section className="ledger-comparison">
          <div className="ledger-comparison-row ledger-comparison-heroes">
            <span>ORDER</span>
            {recommendations.map((item, index) => (
              <button className={expandedPick === index ? "is-selected" : ""} type="button" key={item.hero.id} onClick={() => setExpandedPick(index)}>
                <span>0{index + 1}</span>
                <HeroPortrait hero={item.hero} />
                <strong>{item.hero.name}</strong>
                <small>{item.lane.split("·")[0]}</small>
              </button>
            ))}
          </div>
          <div className="ledger-comparison-row ledger-comparison-score">
            <span>FIT / 100</span>
            {recommendations.map((item) => <strong key={item.hero.id}>{item.score}</strong>)}
          </div>
          <div className="ledger-comparison-row ledger-comparison-advantages">
            <span>ПРЕИМУЩЕСТВА</span>
            {recommendations.map((item) => (
              <div key={item.hero.id}>{item.reasons.map((reason) => <small key={reason}><Check size={11} />{reason}</small>)}</div>
            ))}
          </div>
          <div className="ledger-comparison-row ledger-comparison-risk">
            <span>РИСК</span>
            {recommendations.map((item) => <small key={item.hero.id}>{item.risk}</small>)}
          </div>
        </section>
        <section className="ledger-captain-note">
          <span>ПОЛЕВАЯ ПОМЕТКА</span>
          <strong>Leshrac первым ломает иллюзии и темп Dire.</strong>
          <p>Storm — безопаснее для backline, Pangolier — гибкий план на затяжной бой.</p>
        </section>
        <div className="ledger-result-actions">
          <button type="button" onClick={() => navigate("home")}><RotateCcw size={16} /> Новая запись</button>
          <button type="button" onClick={() => setToast("Заключение сохранено")}><BadgeCheck size={16} /> В архив</button>
        </div>
      </main>
    </div>
  );

  const renderTwinsResult = () => (
    <div className="screen screen-result result-twins">
      <header className="twins-result-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={17} /></button>
        <span><small>ТРИ ПУТИ ЧЕРЕЗ РЕКУ</small><strong>Контрпики готовы</strong></span>
        <span>7.41d</span>
      </header>
      <main className="twins-result-river">
        <div className="twins-result-labels"><span>ОТВЕТ RADIANT</span><i>FIT</i><span>ЦЕЛЬ DIRE</span></div>
        {recommendations.map((item, index) => {
          const open = expandedPick === index;
          return (
            <article className={`twins-counter-bridge ${open ? "is-open" : ""}`} key={item.hero.id}>
              <button type="button" onClick={() => setExpandedPick(open ? -1 : index)} aria-expanded={open}>
                <span className="twins-bridge-radiant">
                  <HeroPortrait hero={item.hero} size={index === 0 ? "large" : "regular"} />
                  <span><small>0{index + 1}</small><strong>{item.hero.name}</strong><i>{item.lane.split("·")[0]}</i></span>
                </span>
                <span className="twins-bridge-score"><small>FIT</small><strong>{item.score}</strong><i /></span>
                <span className="twins-bridge-dire">
                  {enemies[0] ? <HeroPortrait hero={enemies[0]} size="regular" /> : <Target size={23} />}
                  <span><small>KEY TARGET</small><strong>{enemies[0]?.name ?? "Dire draft"}</strong></span>
                </span>
              </button>
              {open ? (
                <div className="twins-bridge-details">
                  <div>{item.reasons.map((reason) => <span key={reason}><TrendingUp size={13} />{reason}</span>)}</div>
                  <p><AlertTriangle size={14} /><span><strong>Риск</strong>{item.risk}</span></p>
                </div>
              ) : null}
            </article>
          );
        })}
        <footer className="twins-result-footer">
          <button type="button" onClick={() => navigate("home")}><RotateCcw size={16} /> Новый драфт</button>
          <button type="button" onClick={() => setToast("Мост сохранён")}><BadgeCheck size={16} /> Сохранить путь</button>
        </footer>
      </main>
    </div>
  );

  const renderWarTableResult = () => {
    const activeIndex = Math.max(0, expandedPick);
    const active = recommendations[activeIndex];
    return (
      <div className="screen screen-result result-wartable">
        <header className="wartable-result-header">
          <button type="button" onClick={() => navigate("home")}><ChevronLeft size={17} /></button>
          <span><small>ТАКТИЧЕСКИЙ ПЛАН</small><strong>Три маршрута контрпика</strong></span>
          <span><Map size={14} /> 7.41d</span>
        </header>
        <main className="wartable-result-workspace">
          <section className="wartable-result-map">
            <span className="wartable-result-route wartable-result-route-one" />
            <span className="wartable-result-route wartable-result-route-two" />
            <span className="wartable-result-route wartable-result-route-three" />
            <div className="wartable-objective">
              <Target size={15} />
              {enemies[0] ? <HeroPortrait hero={enemies[0]} size="small" /> : null}
              <span><small>ЦЕЛЬ</small><strong>{enemies[0]?.name ?? "Dire"}</strong></span>
            </div>
            {recommendations.map((item, index) => (
              <button
                className={`wartable-candidate wartable-candidate-${index + 1} ${activeIndex === index ? "is-selected" : ""}`}
                type="button"
                key={item.hero.id}
                onClick={() => setExpandedPick(index)}
                aria-pressed={activeIndex === index}
              >
                <span><HeroPortrait hero={item.hero} size={index === 0 ? "large" : "regular"} /></span>
                <i>{item.score}</i>
                <strong>{item.hero.name}</strong>
              </button>
            ))}
            <span className="wartable-map-scale">0 ——— 25 MIN</span>
          </section>
          <section className="wartable-field-report">
            <header><span>ПОЛЕВОЙ ОТЧЁТ · 0{activeIndex + 1}</span><strong>{active.hero.name}</strong><small>{active.lane}</small></header>
            <div>
              <section>
                <small>ЗАДАЧИ</small>
                {active.reasons.map((reason) => <span key={reason}><TrendingUp size={13} />{reason}</span>)}
              </section>
              <p><AlertTriangle size={15} /><span><small>ОПАСНОСТЬ</small>{active.risk}</span></p>
            </div>
            <footer>
              <button type="button" onClick={() => navigate("home")}><RotateCcw size={15} /> Сбросить</button>
              <button type="button" onClick={() => setToast("Полевой отчёт сохранён")}><BadgeCheck size={15} /> Сохранить</button>
            </footer>
          </section>
        </main>
      </div>
    );
  };

  const renderSignalResult = () => (
    <div className="screen screen-result result-signal">
      <header className="signal-result-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={16} /> DRAFT</button>
        <span><i /> COUNTERPICK RESULTS</span>
        <strong>LIVE · 7.41d</strong>
      </header>
      <main className="signal-result-console">
        <article className="signal-winner-banner">
          <div className="signal-winner-art">
            <HeroPortrait hero={recommendations[0].hero} size="large" />
            <span>01</span>
          </div>
          <div>
            <span>TOP RECOMMENDATION</span>
            <h1>{recommendations[0].hero.name}</h1>
            <p>{recommendations[0].lane}</p>
            <div className="signal-stat-bar"><span style={{ width: `${recommendations[0].score}%` }} /></div>
          </div>
          <strong><span>{recommendations[0].score}</span><small>FIT</small></strong>
        </article>
        <section className="signal-winner-reasons">
          {recommendations[0].reasons.map((reason) => <span key={reason}><TrendingUp size={13} />{reason}</span>)}
          <p><AlertTriangle size={14} />{recommendations[0].risk}</p>
        </section>
        <section className="signal-runner-table">
          <header><span>RANK</span><span>HERO / ROLE</span><span>FIT</span><span>OPEN</span></header>
          {recommendations.slice(1).map((item, offset) => {
            const index = offset + 1;
            const open = expandedPick === index;
            return (
              <article className={open ? "is-open" : ""} key={item.hero.id}>
                <button type="button" onClick={() => setExpandedPick(open ? 0 : index)}>
                  <span>0{index + 1}</span>
                  <span><HeroPortrait hero={item.hero} /><span><strong>{item.hero.name}</strong><small>{item.lane.split("·")[0]}</small></span></span>
                  <strong>{item.score}</strong>
                  <ChevronRight size={15} />
                </button>
                {open ? <div><span>{item.reasons.join(" · ")}</span><small>RISK · {item.risk}</small></div> : null}
              </article>
            );
          })}
        </section>
        <footer className="signal-result-actions">
          <button type="button" onClick={() => navigate("home")}>NEW DRAFT</button>
          <button type="button" onClick={() => setToast("Результат сохранён")}><BadgeCheck size={15} /> SAVE REPLAY</button>
        </footer>
      </main>
    </div>
  );

  const renderResult = () => (
    <div className="screen screen-result">
      <FlowHeader
        title="Три ответа"
        caption="Мид · Legend · онлайн"
        onBack={() => navigate("home")}
        action={
          <span className="patch-chip">
            <Radio size={13} />
            7.41d · live
          </span>
        }
      />
      <main className="screen-content">
        <section className="result-summary">
          <div className="result-rune">
            <Shield size={20} />
          </div>
          <div>
            <span className="eyebrow">Уверенность высокая</span>
            <h1>Leshrac ломает иллюзии и темп Dire</h1>
            <p>Главная угроза — Phantom Lancer. Не входите первым под Hex и Call.</p>
          </div>
        </section>
        <div className="recommendation-list">
          {recommendations.map((item, index) => {
            const open = expandedPick === index;
            return (
              <article
                className={`recommendation ${index === 0 ? "is-primary" : ""} ${open ? "is-open" : ""}`}
                key={item.hero.id}
              >
                <button
                  className="recommendation-main"
                  type="button"
                  onClick={() => setExpandedPick(open ? -1 : index)}
                  aria-expanded={open}
                >
                  <span className="pick-rank">0{index + 1}</span>
                  <HeroPortrait hero={item.hero} size={index === 0 ? "large" : "regular"} />
                  <span className="pick-copy">
                    <small>{item.label}</small>
                    <strong>{item.hero.name}</strong>
                    <span>{item.lane}</span>
                  </span>
                  <span className="score-orb">
                    <strong>{item.score}</strong>
                    <small>FIT</small>
                  </span>
                  <ChevronRight className="expand-icon" size={17} />
                </button>
                <div className="score-track"><span style={{ width: `${item.score}%` }} /></div>
                {open ? (
                  <div className="recommendation-details">
                    <div className="advantage-list">
                      {item.reasons.map((reason) => (
                        <span key={reason}><TrendingUp size={14} />{reason}</span>
                      ))}
                    </div>
                    <div className="risk-line">
                      <AlertTriangle size={15} />
                      <span><strong>Риск</strong>{item.risk}</span>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        <section className="panel result-context">
          <SectionTitle eyebrow="Почему так" title="Контекст драфта" />
          <div className="context-grid">
            <div><Target size={18} /><span><strong>Phantom Lancer</strong><small>ключевая цель</small></span></div>
            <div><Swords size={18} /><span><strong>Позиция 2</strong><small>линия важнее late</small></span></div>
            <div><Shield size={18} /><span><strong>Legend</strong><small>темп до 25 минуты</small></span></div>
          </div>
        </section>
        <div className="result-actions">
          <button className="secondary-button" type="button" onClick={() => navigate("home")}>
            <RotateCcw size={17} />
            Новый драфт
          </button>
          <button className="compact-button" type="button" onClick={() => setToast("Результат сохранён")}>
            <BadgeCheck size={17} />
            Сохранить
          </button>
        </div>
      </main>
    </div>
  );

  const filteredHistoryItems = historyItems.filter((item) => historyFilter === "Все" || item.role === historyFilter);

  const renderHistoryFilters = () => (
    <div className="history-filter">
      {["Все", "Мид", "Керри", "Оффлейн"].map((item) => (
        <button
          className={historyFilter === item ? "is-selected" : ""}
          type="button"
          key={item}
          onClick={() => setHistoryFilter(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );

  const renderLedgerHistory = () => (
    <div className="screen screen-history history-ledger">
      <header className="ledger-history-header">
        <button type="button" onClick={() => navigate("home")}><BookOpenText size={17} /><span><strong>ARCHIVE LEDGER</strong><small>Counterpick records</small></span></button>
        <span>VOL. 03</span>
      </header>
      <main className="screen-content ledger-history-sheet">
        <section className="ledger-history-heading">
          <span>CHAPTER V · ARCHIVE</span>
          <h1>Журнал подборов</h1>
          {renderHistoryFilters()}
        </section>
        <div className="ledger-history-columns"><span>REF.</span><span>ДАТА / ЗАДАЧА</span><span>ВЫВОД</span><span>FIT</span></div>
        <ol className="ledger-history-register">
          {filteredHistoryItems.map((item, index) => (
            <li key={item.id}>
              <button type="button" onClick={() => navigate("result")}>
                <span>CP-{String(index + 24).padStart(3, "0")}</span>
                <span><small>{item.time}</small><strong>{item.title}</strong></span>
                <span>{item.picks}</span>
                <strong>{item.score}</strong>
              </button>
            </li>
          ))}
        </ol>
        <button className="ledger-empty-link" type="button" onClick={() => { setSelectedState("empty"); navigate("states"); }}>
          Показать пустой лист <ArrowRight size={15} />
        </button>
      </main>
    </div>
  );

  const renderTwinsHistory = () => (
    <div className="screen screen-history history-twins">
      <header className="twins-history-header">
        <span>RADIANT ARCHIVE</span>
        <button type="button" onClick={() => navigate("home")}><History size={17} /><strong>РЕКА РЕШЕНИЙ</strong></button>
        <span>DIRE MEMORY</span>
      </header>
      <main className="twins-history-river">
        {renderHistoryFilters()}
        <ol>
          {filteredHistoryItems.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => navigate("result")}>
                <span className="twins-history-radiant"><small>ЛУЧШИЙ ОТВЕТ</small><strong>{item.picks.split("·")[0]}</strong></span>
                <span className="twins-history-marker"><strong>{item.score}</strong><small>{item.time.split(",")[0]}</small><i /></span>
                <span className="twins-history-dire"><small>{item.role}</small><strong>{item.title}</strong></span>
              </button>
            </li>
          ))}
        </ol>
        <button className="twins-history-empty" type="button" onClick={() => { setSelectedState("empty"); navigate("states"); }}>Очистить русло</button>
      </main>
    </div>
  );

  const renderWarTableHistory = () => (
    <div className="screen screen-history history-wartable">
      <header className="wartable-history-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={17} /></button>
        <span><small>КАРТОТЕКА</small><strong>Архив тактических карт</strong></span>
        <Map size={17} />
      </header>
      <main className="wartable-map-archive">
        {renderHistoryFilters()}
        <ol>
          {filteredHistoryItems.map((item, index) => (
            <li key={item.id}>
              <button type="button" onClick={() => navigate("result")}>
                <span className="wartable-mini-map">
                  <i /><i /><i />
                  <Target size={18} />
                  <strong>0{index + 1}</strong>
                </span>
                <span><small>{item.time} · {item.role}</small><strong>{item.title}</strong><span>{item.picks}</span></span>
                <i className="wartable-record-stamp">{item.score}</i>
              </button>
            </li>
          ))}
        </ol>
        <button className="wartable-archive-empty" type="button" onClick={() => { setSelectedState("empty"); navigate("states"); }}><History size={15} /> Пустая карта</button>
      </main>
    </div>
  );

  const renderSignalHistory = () => (
    <div className="screen screen-history history-signal">
      <header className="signal-history-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={16} /> CONTROL</button>
        <span><i /> REPLAY FEED</span>
        <strong>03 ITEMS</strong>
      </header>
      <main className="signal-history-feed">
        <section className="signal-history-toolbar">
          <span><small>ARCHIVE CHANNEL</small><strong>COUNTERPICK REPLAYS</strong></span>
          {renderHistoryFilters()}
        </section>
        <div className="signal-history-table">
          <header><span>TIME</span><span>MATCH / TOP 3</span><span>FIT</span><span>PLAY</span></header>
          {filteredHistoryItems.map((item, index) => (
            <button type="button" key={item.id} onClick={() => navigate("result")}>
              <span><small>CH 0{index + 1}</small><strong>{item.time.split(",")[0]}</strong></span>
              <span><strong>{item.title}</strong><small>{item.picks}</small></span>
              <strong>{item.score}</strong>
              <Radio size={15} />
            </button>
          ))}
        </div>
        <div className="signal-history-ticker"><span>REPLAYS STORED LOCALLY</span><i /><span>SYNC READY</span></div>
        <button className="signal-history-empty" type="button" onClick={() => { setSelectedState("empty"); navigate("states"); }}>EMPTY FEED</button>
      </main>
    </div>
  );

  const renderHistory = () => (
    <div className="screen screen-history">
      <AppTopBar
        theme={theme}
        attempts={3}
        onTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        onHome={() => navigate("home")}
      />
      <main className="screen-content">
        <section className="page-heading">
          <span className="eyebrow">Ваши решения</span>
          <h1>История подборов</h1>
          <p>Возвращайтесь к драфтам и сравнивайте варианты.</p>
        </section>
        <div className="history-filter">
          {["Все", "Мид", "Керри", "Оффлейн"].map((item) => (
            <button
              className={historyFilter === item ? "is-selected" : ""}
              type="button"
              key={item}
              onClick={() => setHistoryFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <section className="history-list">
          {historyItems
            .filter((item) => historyFilter === "Все" || item.role === historyFilter)
            .map((item, index) => (
            <button className="history-item" type="button" key={item.id} onClick={() => navigate("result")}>
              <span className="history-index">0{index + 1}</span>
              <span className="history-copy">
                <small>{item.time}</small>
                <strong>{item.title}</strong>
                <span>{item.picks}</span>
              </span>
              <span className="history-score">{item.score}</span>
              <ChevronRight size={17} />
            </button>
          ))}
        </section>
        <button className="secondary-button full-width" type="button" onClick={() => {
          setSelectedState("empty");
          navigate("states");
        }}>
          <History size={17} />
          Показать пустое состояние
        </button>
      </main>
    </div>
  );

  const openDeleteState = () => {
    setSelectedState("delete");
    navigate("states");
  };

  const renderLedgerProfile = () => (
    <div className="screen screen-profile profile-ledger">
      <header className="ledger-profile-header">
        <button type="button" onClick={() => navigate("home")}><BookOpenText size={17} /><span><strong>PLAYER DOSSIER</strong><small>Personal field record</small></span></button>
        <span>ID · BP-024</span>
      </header>
      <main className="screen-content ledger-profile-sheet">
        <section className="ledger-profile-identity">
          <div className="profile-avatar">BP</div>
          <span><small>ЛОКАЛЬНЫЙ ОПЕРАТОР</small><h1>Draft captain</h1><p>История хранится на этом устройстве.</p></span>
          <button type="button" onClick={() => navigate("auth")}>Войти</button>
        </section>
        <div className="ledger-profile-table">
          <section>
            <span>01 · ТАРИФ</span>
            <div><strong>Free · 2 из 3 попыток</strong><div className="quota-track"><span style={{ width: "67%" }} /></div><small>Обновление завтра в 00:00</small></div>
            <button type="button" onClick={() => navigate("plans")}>Открыть Pro <ChevronRight size={15} /></button>
          </section>
          <section>
            <span>02 · ТЕМА</span>
            <div className="ledger-theme-options">
              <button className={theme === "light" ? "is-selected" : ""} type="button" onClick={() => setTheme("light")}><Sun size={15} /> Светлый лист</button>
              <button className={theme === "dark" ? "is-selected" : ""} type="button" onClick={() => setTheme("dark")}><Moon size={15} /> Ночной лист</button>
            </div>
          </section>
          <section>
            <span>03 · ДАННЫЕ</span>
            <div><strong>Архив подборов</strong><small>3 локальные записи · синхронизация выключена</small></div>
            <button type="button" onClick={() => setToast("Архив экспортирован")}>Экспорт <Upload size={15} /></button>
          </section>
          <section>
            <span>04 · СИСТЕМА</span>
            <div><strong>Служебные состояния</strong><small>Загрузка, офлайн, ошибки и лимиты</small></div>
            <button type="button" onClick={() => navigate("states")}>Открыть <ChevronRight size={15} /></button>
          </section>
        </div>
        <button className="ledger-profile-danger" type="button" onClick={openDeleteState}><Trash2 size={16} /> Аннулировать аккаунт</button>
      </main>
    </div>
  );

  const renderTwinsProfile = () => (
    <div className="screen screen-profile profile-twins">
      <header className="twins-profile-header">
        <span><i />RADIANT</span>
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={16} /> ПРОФИЛЬ</button>
        <span>DIRE<i /></span>
      </header>
      <main className="twins-profile-layout">
        <section className="twins-profile-bridge">
          <span className="twins-profile-ancient twins-profile-ancient-ally" />
          <div className="profile-avatar">BP</div>
          <span className="twins-profile-ancient twins-profile-ancient-enemy" />
          <div><small>ВАШ ДРАФТ-ПРОФИЛЬ</small><h1>Draft operator</h1><button type="button" onClick={() => navigate("auth")}>Войти и синхронизировать</button></div>
        </section>
        <div className="twins-profile-banks">
          <section className="twins-profile-bank twins-profile-bank-ally">
            <header><span>ИГРА</span><strong>RADIANT</strong></header>
            <div><small>РАНГ</small><strong>{rank}</strong></div>
            <div><small>ПОЗИЦИЯ</small><strong>0{position}</strong></div>
            <div className="twins-profile-theme">
              <small>ТЕМА</small>
              <button className={theme === "light" ? "is-selected" : ""} type="button" onClick={() => setTheme("light")}><Sun size={15} /></button>
              <button className={theme === "dark" ? "is-selected" : ""} type="button" onClick={() => setTheme("dark")}><Moon size={15} /></button>
            </div>
          </section>
          <section className="twins-profile-bank twins-profile-bank-enemy">
            <header><strong>DIRE</strong><span>АККАУНТ</span></header>
            <div><small>ПОПЫТКИ</small><strong>2 / 3</strong><div className="quota-track"><span style={{ width: "67%" }} /></div></div>
            <button type="button" onClick={() => navigate("plans")}><Star size={15} /> Counterpick Pro</button>
            <button type="button" onClick={() => navigate("states")}><Settings2 size={15} /> Состояния</button>
          </section>
        </div>
        <button className="twins-profile-danger" type="button" onClick={openDeleteState}><Trash2 size={15} /> Удалить профиль</button>
      </main>
    </div>
  );

  const renderWarTableProfile = () => (
    <div className="screen screen-profile profile-wartable">
      <header className="wartable-profile-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={17} /></button>
        <span><small>ИНВЕНТАРЬ ОПЕРАТОРА</small><strong>Quartermaster case</strong></span>
        <Target size={17} />
      </header>
      <main className="wartable-profile-case">
        <section className="wartable-dogtag">
          <div className="profile-avatar">BP</div>
          <span><small>ЛОКАЛЬНЫЙ ПРОФИЛЬ</small><strong>Draft operator</strong><i>ID · CP-024</i></span>
          <button type="button" onClick={() => navigate("auth")}>Войти</button>
        </section>
        <div className="wartable-case-grid">
          <section className="wartable-case-quota">
            <span><Sparkles size={16} /> ЗАПАС АНАЛИЗОВ</span>
            <strong>02<i>/03</i></strong>
            <div className="quota-track"><span style={{ width: "67%" }} /></div>
            <small>Новый запас в 00:00</small>
          </section>
          <section>
            <span><Target size={16} /> НАЗНАЧЕНИЕ</span>
            <strong>{rank}</strong>
            <small>Position 0{position}</small>
          </section>
          <section className="wartable-case-theme">
            <span><Sun size={16} /> ВИД КАРТЫ</span>
            <button className={theme === "light" ? "is-selected" : ""} type="button" onClick={() => setTheme("light")}>DAY</button>
            <button className={theme === "dark" ? "is-selected" : ""} type="button" onClick={() => setTheme("dark")}>NIGHT</button>
          </section>
          <section>
            <span><Star size={16} /> ДОПУСК</span>
            <strong>FREE</strong>
            <button type="button" onClick={() => navigate("plans")}>Получить Pro</button>
          </section>
        </div>
        <section className="wartable-account-drawer">
          <span className="drawer-handle" />
          <button type="button" onClick={() => navigate("states")}><Settings2 size={15} /> Состояния</button>
          <button type="button" onClick={() => setToast("Архив экспортирован")}><Upload size={15} /> Экспорт</button>
          <button type="button" onClick={openDeleteState}><Trash2 size={15} /> Удалить</button>
        </section>
      </main>
    </div>
  );

  const renderSignalProfile = () => (
    <div className="screen screen-profile profile-signal">
      <header className="signal-profile-header">
        <button type="button" onClick={() => navigate("home")}><ChevronLeft size={16} /> CONTROL</button>
        <span><i /> OPERATOR CHANNEL</span>
        <strong>LOCAL</strong>
      </header>
      <main className="signal-profile-dashboard">
        <section className="signal-profile-identity">
          <div className="profile-avatar">BP</div>
          <span><small>ACTIVE OPERATOR</small><h1>Draft control</h1><p>Counterpick signal is online</p></span>
          <button type="button" onClick={() => navigate("auth")}>SIGN IN</button>
        </section>
        <section className="signal-profile-metrics">
          <div><small>ATTEMPTS</small><strong>02<i>/03</i></strong><span>FREE</span></div>
          <div><small>RANK POOL</small><strong>{rank.toUpperCase()}</strong><span>POS 0{position}</span></div>
          <button type="button" onClick={() => navigate("plans")}><small>PLAN</small><strong>UPGRADE</strong><span>PRO <ArrowRight size={13} /></span></button>
        </section>
        <section className="signal-profile-controls">
          <header><span>CONTROL</span><span>STATUS</span><span>ACTION</span></header>
          <div><span><Sun size={15} /> INTERFACE</span><strong>{theme.toUpperCase()}</strong><span><button type="button" onClick={() => setTheme("light")}>LIGHT</button><button type="button" onClick={() => setTheme("dark")}>DARK</button></span></div>
          <button type="button" onClick={() => navigate("states")}><span><Settings2 size={15} /> UI STATES</span><strong>07 READY</strong><ChevronRight size={15} /></button>
          <button type="button" onClick={() => setToast("Архив экспортирован")}><span><Upload size={15} /> REPLAY ARCHIVE</span><strong>03 ITEMS</strong><ChevronRight size={15} /></button>
          <button className="is-danger" type="button" onClick={openDeleteState}><span><Trash2 size={15} /> ACCOUNT</span><strong>LOCAL</strong><span>DELETE</span></button>
        </section>
        <div className="signal-profile-ticker"><span>META ONLINE</span><i /><span>SYNC AVAILABLE</span><i /><span>7.41d</span></div>
      </main>
    </div>
  );

  const renderProfile = () => (
    <div className="screen screen-profile">
      <AppTopBar
        theme={theme}
        attempts={3}
        onTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        onHome={() => navigate("home")}
      />
      <main className="screen-content">
        <section className="profile-identity">
          <div className="profile-avatar">BP</div>
          <div>
            <span className="eyebrow">Локальный профиль</span>
            <h1>Ваш драфт-стол</h1>
            <p>Войдите, чтобы синхронизировать историю.</p>
          </div>
          <button className="compact-button" type="button" onClick={() => navigate("auth")}>
            Войти
          </button>
        </section>
        <section className="attempts-panel panel">
          <div className="attempts-orb"><Sparkles size={22} /></div>
          <div>
            <span className="eyebrow">Бесплатный тариф</span>
            <strong>2 из 3 попыток</strong>
            <div className="quota-track"><span style={{ width: "67%" }} /></div>
            <small>Обновятся завтра в 00:00</small>
          </div>
          <button className="icon-button" type="button" onClick={() => navigate("plans")} aria-label="Открыть тарифы">
            <ChevronRight size={18} />
          </button>
        </section>
        <section className="settings-section panel">
          <SectionTitle eyebrow="Внешний вид" title="Тема" />
          <div className="theme-switch" role="group" aria-label="Тема приложения">
            <button
              className={theme === "light" ? "is-selected" : ""}
              type="button"
              onClick={() => setTheme("light")}
            >
              <Sun size={17} /> Светлая
            </button>
            <button
              className={theme === "dark" ? "is-selected" : ""}
              type="button"
              onClick={() => setTheme("dark")}
            >
              <Moon size={17} /> Тёмная
            </button>
          </div>
        </section>
        <section className="settings-list panel">
          <button type="button" onClick={() => navigate("plans")}>
            <span className="setting-icon"><Star size={18} /></span>
            <span><strong>Counterpick Pro</strong><small>100 анализов в день и больше данных</small></span>
            <ChevronRight size={17} />
          </button>
          <button type="button" onClick={() => navigate("states")}>
            <span className="setting-icon"><Settings2 size={18} /></span>
            <span><strong>Состояния интерфейса</strong><small>Ошибки, офлайн и пустые данные</small></span>
            <ChevronRight size={17} />
          </button>
          <button type="button" onClick={() => setToast("История экспортирована")}>
            <span className="setting-icon"><Upload size={18} /></span>
            <span><strong>Экспорт истории</strong><small>Сохранить локальную копию</small></span>
            <ChevronRight size={17} />
          </button>
        </section>
        <button
          className="danger-button"
          type="button"
          onClick={() => {
            setSelectedState("delete");
            navigate("states");
          }}
        >
          <Trash2 size={17} />
          Удалить аккаунт
        </button>
      </main>
    </div>
  );

  const renderVariantAuthForm = (mode: "ledger" | "twins" | "wartable" | "signal") => (
    <form
      className={`variant-auth-form variant-auth-form-${mode}`}
      onSubmit={(event) => {
        event.preventDefault();
        setToast(authMode === "login" ? "Вы вошли в демо-профиль" : "Демо-профиль создан");
        navigate("profile");
      }}
    >
      <label>
        <span>Почта</span>
        <div className="input-shell">
          <Mail size={17} />
          <input type="email" placeholder="player@example.com" required />
        </div>
      </label>
      <label>
        <span>Пароль</span>
        <div className="input-shell">
          <LockKeyhole size={17} />
          <input type={showPassword ? "text" : "password"} placeholder="Минимум 8 символов" required minLength={8} />
          <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label="Показать пароль">
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <button type="submit">
        <UserRound size={17} />
        <span>{authMode === "login" ? "Войти" : "Создать профиль"}</span>
        <ArrowRight size={17} />
      </button>
    </form>
  );

  const renderVariantAuthSwitch = () => (
    <div className="variant-auth-switch" role="tablist">
      <button className={authMode === "login" ? "is-selected" : ""} type="button" onClick={() => setAuthMode("login")}>Вход</button>
      <button className={authMode === "register" ? "is-selected" : ""} type="button" onClick={() => setAuthMode("register")}>Регистрация</button>
    </div>
  );

  const renderLedgerAuth = () => (
    <div className="screen screen-auth auth-ledger-structure">
      <header className="ledger-service-header">
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={17} /><BookOpenText size={17} /></button>
        <span><small>ACCOUNT RECORD</small><strong>Личная запись</strong></span>
        <span>FORM 01</span>
      </header>
      <main className="ledger-auth-sheet">
        <aside><span>01</span><span>02</span><span>03</span></aside>
        <section>
          <header><span>CHAPTER VI · IDENTITY</span><h1>{authMode === "login" ? "Вернуться к журналу" : "Завести новый журнал"}</h1><p>Синхронизация подборов между устройствами.</p></header>
          {renderVariantAuthSwitch()}
          {renderVariantAuthForm("ledger")}
          <button className="ledger-auth-guest" type="button" onClick={() => navigate("home")}>Продолжить без записи</button>
        </section>
      </main>
    </div>
  );

  const renderTwinsAuth = () => (
    <div className="screen screen-auth auth-twins-structure">
      <header className="twins-auth-header">
        <span>RADIANT</span>
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={16} /> IDENTITY BRIDGE</button>
        <span>DIRE</span>
      </header>
      <main className="twins-auth-shell">
        <section className="twins-auth-bank twins-auth-bank-ally"><i /><small>ЛОКАЛЬНО</small><strong>Ваши драфты</strong></section>
        <section className="twins-auth-bridge">
          <div className="profile-avatar">BP</div>
          <span><small>СИНХРОНИЗАЦИЯ</small><h1>{authMode === "login" ? "Соединить берега" : "Создать мост"}</h1></span>
          {renderVariantAuthSwitch()}
          {renderVariantAuthForm("twins")}
          <button type="button" onClick={() => navigate("home")}>Остаться на этом берегу</button>
        </section>
        <section className="twins-auth-bank twins-auth-bank-enemy"><i /><small>ОБЛАКО</small><strong>Все устройства</strong></section>
      </main>
    </div>
  );

  const renderWarTableAuth = () => (
    <div className="screen screen-auth auth-wartable-structure">
      <header className="wartable-service-header">
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={17} /></button>
        <span><small>ДОПУСК ОПЕРАТОРА</small><strong>Идентификация</strong></span>
        <Target size={17} />
      </header>
      <main className="wartable-auth-map">
        <div className="wartable-auth-beacon"><span /><UserRound size={25} /><small>OPERATOR</small></div>
        <section className="wartable-auth-drawer">
          <span className="drawer-handle" />
          <header><span><small>QUARTERMASTER FILE</small><h1>{authMode === "login" ? "Получить доступ" : "Новый оператор"}</h1></span><strong>CP-024</strong></header>
          {renderVariantAuthSwitch()}
          {renderVariantAuthForm("wartable")}
          <button type="button" onClick={() => navigate("home")}>Вернуться к карте без входа</button>
        </section>
      </main>
    </div>
  );

  const renderSignalAuth = () => (
    <div className="screen screen-auth auth-signal-structure">
      <header className="signal-service-header">
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={16} /> CONTROL</button>
        <span><i /> IDENTITY CHANNEL</span>
        <strong>SECURE</strong>
      </header>
      <main className="signal-auth-console">
        <section className="signal-auth-ident">
          <div className="profile-avatar">BP</div>
          <span><small>OPERATOR ACCESS</small><h1>{authMode === "login" ? "SIGN IN" : "REGISTER"}</h1><p>Replay sync · plan · attempts</p></span>
          <strong>01</strong>
        </section>
        <div className="signal-auth-mode">{renderVariantAuthSwitch()}</div>
        <section className="signal-auth-table">
          <header><span>FIELD</span><span>VALUE</span><span>STATUS</span></header>
          {renderVariantAuthForm("signal")}
        </section>
        <div className="signal-auth-ticker"><span>ENCRYPTED</span><i /><span>SYNC READY</span><i /><span>7.41d</span></div>
        <button className="signal-auth-guest" type="button" onClick={() => navigate("home")}>CONTINUE OFFLINE</button>
      </main>
    </div>
  );

  const renderAuth = () => (
    <div className={`screen screen-auth auth-${designId}`}>
      <FlowHeader title="Counterpick" caption="Синхронизация между устройствами" onBack={() => navigate("profile")} />
      <main className="screen-content auth-content">
        <div className="auth-mark">
          <img src="/brand/counterpick-mark.png" alt="" />
          <span className="rune-pulse" />
        </div>
        <section className="auth-heading">
          <span className="eyebrow">Ваши драфты рядом</span>
          <h1>{authMode === "login" ? "С возвращением" : "Создайте профиль"}</h1>
          <p>
            {authMode === "login"
              ? "Войдите, чтобы продолжить с сохранённой историей."
              : "Сохраняйте анализы и попытки на всех устройствах."}
          </p>
        </section>
        <div className="auth-switch" role="tablist">
          <button
            className={authMode === "login" ? "is-selected" : ""}
            type="button"
            onClick={() => setAuthMode("login")}
          >
            Вход
          </button>
          <button
            className={authMode === "register" ? "is-selected" : ""}
            type="button"
            onClick={() => setAuthMode("register")}
          >
            Регистрация
          </button>
        </div>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            setToast(authMode === "login" ? "Вы вошли в демо-профиль" : "Демо-профиль создан");
            navigate("profile");
          }}
        >
          <label>
            <span>Почта</span>
            <div className="input-shell">
              <Mail size={18} />
              <input type="email" placeholder="player@example.com" required />
            </div>
          </label>
          <label>
            <span>Пароль</span>
            <div className="input-shell">
              <LockKeyhole size={18} />
              <input type={showPassword ? "text" : "password"} placeholder="Минимум 8 символов" required minLength={8} />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label="Показать пароль">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <button className="primary-cta auth-submit" type="submit">
            <span className="cta-icon"><UserRound size={18} /></span>
            <span><strong>{authMode === "login" ? "Войти" : "Создать профиль"}</strong></span>
            <ArrowRight size={18} />
          </button>
        </form>
        <button className="guest-button" type="button" onClick={() => navigate("home")}>
          Продолжить без аккаунта
        </button>
      </main>
    </div>
  );

  const activatePro = () => {
    setToast("Pro выбран в демо-режиме");
    navigate("profile");
  };

  const proFeatures = [
    "100 анализов каждый день",
    "Мета по рангу и позиции",
    "Фото без дневного лимита",
    "Офлайн-рекомендации",
    "История на всех устройствах",
  ];

  const renderLedgerPlans = () => (
    <div className="screen screen-plans plans-ledger-structure">
      <header className="ledger-service-header">
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={17} /><Star size={17} /></button>
        <span><small>PLAN REGISTER</small><strong>Тарифная ведомость</strong></span>
        <span>FORM 02</span>
      </header>
      <main className="ledger-plan-sheet">
        <section className="ledger-plan-heading"><span>CHAPTER VII · ACCESS</span><h1>Сравнить допуски</h1><p>Один лист вместо отдельной продающей карточки.</p></section>
        <div className="ledger-billing-line">
          <span>ПЕРИОД</span>
          <button className={!annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(false)}>Месяц</button>
          <button className={annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(true)}>Год · −35%</button>
        </div>
        <section className="ledger-plan-comparison">
          <header><span>ПАРАМЕТР</span><span>FREE</span><span>PRO</span></header>
          <div><span>Цена / месяц</span><strong>₸0</strong><strong>{annual ? "₸1 490" : "₸2 290"}</strong></div>
          {proFeatures.map((feature, index) => (
            <div key={feature}><span>{feature}</span><i>{index === 0 ? "5 / день" : "—"}</i><i><Check size={13} /></i></div>
          ))}
        </section>
        <button className="ledger-plan-seal" type="button" onClick={activatePro}><span><BadgeCheck size={19} /></span><span><small>ЗАВЕРИТЬ PRO</small><strong>7 дней бесплатно</strong></span><ArrowRight size={17} /></button>
        <small className="ledger-plan-legal">Демо-прототип · платёж не списывается</small>
      </main>
    </div>
  );

  const renderTwinsPlans = () => (
    <div className="screen screen-plans plans-twins-structure">
      <header className="twins-auth-header">
        <span>FREE</span>
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={16} /> PLAN BRIDGE</button>
        <span>PRO</span>
      </header>
      <main className="twins-plan-river">
        <section className="twins-plan-bank twins-plan-bank-free">
          <span>ВАШ БЕРЕГ</span><h2>Free</h2><strong>5</strong><small>анализов в день</small>
          <button type="button" onClick={() => navigate("profile")}>Текущий</button>
        </section>
        <section className="twins-plan-bridge">
          <Star size={21} />
          <small>COUNTERPICK</small>
          <h1>PRO</h1>
          <strong>{annual ? "₸1 490" : "₸2 290"}<i>/мес</i></strong>
          <div><button className={!annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(false)}>Мес</button><button className={annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(true)}>Год</button></div>
          <button type="button" onClick={activatePro}>ПЕРЕЙТИ <ArrowRight size={15} /></button>
        </section>
        <section className="twins-plan-bank twins-plan-bank-pro">
          <span>ДРУГОЙ БЕРЕГ</span><h2>Pro</h2><strong>100</strong><small>анализов в день</small>
          <div>{proFeatures.slice(1).map((feature) => <span key={feature}><Check size={12} />{feature}</span>)}</div>
        </section>
      </main>
    </div>
  );

  const renderWarTablePlans = () => (
    <div className="screen screen-plans plans-wartable-structure">
      <header className="wartable-service-header">
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={17} /></button>
        <span><small>УРОВЕНЬ ДОПУСКА</small><strong>Counterpick Pro</strong></span>
        <Star size={17} />
      </header>
      <main className="wartable-plan-map">
        <section className="wartable-license-target">
          <span /><Star size={27} /><small>PRO LICENSE</small><strong>100</strong><i>ХОДОВ / ДЕНЬ</i>
        </section>
        <section className="wartable-plan-case">
          <span className="drawer-handle" />
          <header><span><small>ПОЛЕВОЙ ДОПУСК</small><h1>{annual ? "Годовой Pro" : "Месячный Pro"}</h1></span><strong>{annual ? "₸1 490" : "₸2 290"}<i>/мес</i></strong></header>
          <div className="wartable-plan-period"><button className={!annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(false)}>30 дней</button><button className={annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(true)}>12 месяцев · −35%</button></div>
          <div className="wartable-supply-grid">{proFeatures.map((feature, index) => <span key={feature}><i>{String(index + 1).padStart(2, "0")}</i><Check size={13} /><strong>{feature}</strong></span>)}</div>
          <button type="button" onClick={activatePro}><Shield size={17} /> Получить допуск <ArrowRight size={17} /></button>
        </section>
      </main>
    </div>
  );

  const renderSignalPlans = () => (
    <div className="screen screen-plans plans-signal-structure">
      <header className="signal-service-header">
        <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={16} /> CONTROL</button>
        <span><i /> PLAN CHANNEL</span>
        <strong>UPGRADE</strong>
      </header>
      <main className="signal-plan-console">
        <section className="signal-plan-headline"><span>COUNTERPICK ACCESS</span><h1>GO PRO</h1><div><small>ANALYSES</small><strong>100</strong><small>DAILY</small></div></section>
        <div className="signal-plan-period"><button className={!annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(false)}>MONTHLY</button><button className={annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(true)}>ANNUAL · SAVE 35%</button></div>
        <section className="signal-plan-scoreboard">
          <header><span>FEATURE</span><span>FREE</span><span>PRO</span></header>
          {proFeatures.map((feature, index) => <div key={feature}><span>{feature}</span><i>{index === 0 ? "05" : "—"}</i><strong>{index === 0 ? "100" : <Check size={13} />}</strong></div>)}
        </section>
        <section className="signal-plan-price"><span><small>LIVE PRICE</small><strong>{annual ? "₸1 490" : "₸2 290"}<i>/MONTH</i></strong></span><button type="button" onClick={activatePro}>TAKE PRO <ArrowRight size={17} /></button></section>
        <div className="signal-auth-ticker"><span>7 DAYS FREE</span><i /><span>CANCEL ANYTIME</span><i /><span>DEMO</span></div>
      </main>
    </div>
  );

  const renderPlans = () => (
    <div className={`screen screen-plans plans-${designId}`}>
      <FlowHeader title="Counterpick Pro" caption="Больше данных, меньше сомнений" onBack={() => navigate("profile")} />
      <main className="screen-content">
        <section className="pro-hero">
          <div className="pro-rune"><Star size={26} /></div>
          <span className="eyebrow">Для тех, кто играет регулярно</span>
          <h1>100 пиков в день.</h1>
          <p>Расширенная мета, фильтр по рангу и история без ограничений.</p>
        </section>
        <div className="billing-switch" role="group" aria-label="Период оплаты">
          <button className={!annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(false)}>
            Месяц
          </button>
          <button className={annual ? "is-selected" : ""} type="button" onClick={() => setAnnual(true)}>
            Год <span>−35%</span>
          </button>
        </div>
        <section className="plan-card plan-card-pro">
          <div className="plan-top">
            <div>
              <span className="eyebrow">PRO</span>
              <h2>{annual ? "₸1 490" : "₸2 290"}<small>/мес</small></h2>
            </div>
            <BadgeCheck size={28} />
          </div>
          <div className="feature-list">
            {[
              "100 анализов каждый день",
              "Мета по рангу и позиции",
              "Фото без дневного лимита",
              "Офлайн-рекомендации",
              "История на всех устройствах",
            ].map((feature) => (
              <span key={feature}><Check size={16} />{feature}</span>
            ))}
          </div>
          <button
            className="primary-cta"
            type="button"
            onClick={() => {
              setToast("Pro выбран в демо-режиме");
              navigate("profile");
            }}
          >
            <span className="cta-icon"><CreditCard size={18} /></span>
            <span>
              <strong>Попробовать Pro</strong>
              <small>7 дней бесплатно · отмена в любое время</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </section>
        <section className="free-plan-row">
          <span><strong>Free</strong><small>5 анализов в день</small></span>
          <span>Текущий тариф</span>
        </section>
        <p className="legal-copy">Демо-прототип: платёж не списывается.</p>
      </main>
    </div>
  );

  const renderVariantStateTabs = (mode: "ledger" | "twins" | "wartable" | "signal") => (
    <div className={`variant-state-tabs variant-state-tabs-${mode}`}>
      {states.map((item, index) => (
        <button className={selectedState === item.id ? "is-selected" : ""} type="button" key={item.id} onClick={() => setSelectedState(item.id)}>
          <span>{String(index + 1).padStart(2, "0")}</span><item.icon size={14} /><small>{item.label}</small>
        </button>
      ))}
    </div>
  );

  const renderLedgerStates = () => {
    const StateIcon = activeState.icon;
    return (
      <div className="screen screen-states states-ledger-structure">
        <header className="ledger-service-header">
          <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={17} /><Settings2 size={17} /></button>
          <span><small>SYSTEM REGISTER</small><strong>Служебные записи</strong></span>
          <span>7 STATES</span>
        </header>
        <main className="ledger-state-sheet">
          {renderVariantStateTabs("ledger")}
          <section className="ledger-state-record">
            <header><span>INCIDENT · {selectedState.toUpperCase()}</span><strong>{activeState.kind.toUpperCase()}</strong></header>
            <div className="ledger-state-body"><span className="ledger-state-number">CP-0{states.findIndex((item) => item.id === selectedState) + 1}</span><StateAnimation kind={activeState.kind} /><span className="ledger-state-icon"><StateIcon size={17} /></span><h1>{activeState.title}</h1><p>{activeState.body}</p></div>
            <footer><span><small>STATUS</small><strong>{selectedState === "loading" ? "IN PROGRESS" : "ACTION READY"}</strong></span><button type="button" onClick={handleStateAction}>{activeState.action}<ArrowRight size={15} /></button></footer>
          </section>
          {selectedState === "delete" ? <button className="ledger-state-cancel" type="button" onClick={() => navigate("profile")}>Оставить аккаунт</button> : null}
        </main>
      </div>
    );
  };

  const renderTwinsStates = () => {
    const StateIcon = activeState.icon;
    return (
      <div className="screen screen-states states-twins-structure">
        <header className="twins-auth-header">
          <span>RADIANT</span>
          <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={16} /> STATE RIVER</button>
          <span>DIRE</span>
        </header>
        <main className="twins-state-river">
          {renderVariantStateTabs("twins")}
          <section className={`twins-state-stage twins-state-stage-${activeState.kind}`}>
            <aside><span>ПРИЧИНА</span><strong>{activeState.kind === "warning" ? "Dire event" : "Radiant flow"}</strong><i /></aside>
            <div><StateAnimation kind={activeState.kind} /><span><StateIcon size={17} /></span><h1>{activeState.title}</h1><p>{activeState.body}</p><button type="button" onClick={handleStateAction}>{activeState.action}<ArrowRight size={15} /></button></div>
            <aside><i /><span>СЛЕДУЮЩИЙ ШАГ</span><strong>{selectedState === "delete" ? "Решение игрока" : "Без тупика"}</strong></aside>
          </section>
          {selectedState === "delete" ? <button className="twins-state-cancel" type="button" onClick={() => navigate("profile")}>Вернуться на свой берег</button> : null}
        </main>
      </div>
    );
  };

  const renderWarTableStates = () => {
    const StateIcon = activeState.icon;
    return (
      <div className="screen screen-states states-wartable-structure">
        <header className="wartable-service-header">
          <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={17} /></button>
          <span><small>СОБЫТИЯ КАРТЫ</small><strong>Служебный стол</strong></span>
          <Target size={17} />
        </header>
        <main className="wartable-state-map">
          {renderVariantStateTabs("wartable")}
          <section className="wartable-state-target"><span className="wartable-state-ring" /><StateAnimation kind={activeState.kind} /><span><StateIcon size={18} /></span><small>{selectedState.toUpperCase()}</small></section>
          <section className="wartable-state-drawer">
            <span className="drawer-handle" />
            <header><span><small>ПОЛЕВОЕ СОБЫТИЕ</small><h1>{activeState.title}</h1></span><strong>0{states.findIndex((item) => item.id === selectedState) + 1}</strong></header>
            <p>{activeState.body}</p>
            <div><span><small>SEVERITY</small><strong>{activeState.kind}</strong></span><span><small>RECOVERY</small><strong>AVAILABLE</strong></span></div>
            <button type="button" onClick={handleStateAction}>{activeState.action}<ArrowRight size={16} /></button>
            {selectedState === "delete" ? <button type="button" onClick={() => navigate("profile")}>Отмена операции</button> : null}
          </section>
        </main>
      </div>
    );
  };

  const renderSignalStates = () => {
    const StateIcon = activeState.icon;
    return (
      <div className="screen screen-states states-signal-structure">
        <header className="signal-service-header">
          <button type="button" onClick={() => navigate("profile")}><ChevronLeft size={16} /> CONTROL</button>
          <span><i /> SYSTEM FEED</span>
          <strong>07 STATES</strong>
        </header>
        <main className="signal-state-console">
          {renderVariantStateTabs("signal")}
          <section className="signal-state-alert">
            <header><span>CH 0{states.findIndex((item) => item.id === selectedState) + 1}</span><strong>{selectedState.toUpperCase()}</strong><i>{activeState.kind.toUpperCase()}</i></header>
            <div><StateAnimation kind={activeState.kind} /><span><StateIcon size={18} /></span><section><small>USER MESSAGE</small><h1>{activeState.title}</h1><p>{activeState.body}</p></section></div>
            <footer><span><small>NEXT ACTION</small><strong>USER CONTROLLED</strong></span><button type="button" onClick={handleStateAction}>{activeState.action}<ArrowRight size={15} /></button></footer>
          </section>
          {selectedState === "delete" ? <button className="signal-state-cancel" type="button" onClick={() => navigate("profile")}>CANCEL DELETE</button> : null}
          <div className="signal-auth-ticker"><span>LOTTIE 56–80 PX</span><i /><span>NO DEAD ENDS</span><i /><span>READY</span></div>
        </main>
      </div>
    );
  };

  const renderStates = () => {
    const StateIcon = activeState.icon;
    return (
      <div className={`screen screen-states states-${designId}`}>
        <FlowHeader title="Состояния" caption="Служебные моменты без тупиков" onBack={() => navigate("profile")} />
        <main className="screen-content">
          <div className="state-tabs">
            {states.map((item) => (
              <button
                className={selectedState === item.id ? "is-selected" : ""}
                type="button"
                key={item.id}
                onClick={() => setSelectedState(item.id)}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </div>
          <section className={`state-stage state-stage-${activeState.kind}`}>
            <span className="state-stage-rune" aria-hidden="true" />
            <StateAnimation kind={activeState.kind} />
            <span className="state-icon"><StateIcon size={19} /></span>
            <h1>{activeState.title}</h1>
            <p>{activeState.body}</p>
            <button
              className={selectedState === "delete" ? "danger-button" : "compact-button"}
              type="button"
              onClick={handleStateAction}
            >
              {selectedState === "delete" ? <Trash2 size={17} /> : <ArrowRight size={17} />}
              {activeState.action}
            </button>
            {selectedState === "delete" ? (
              <button className="text-button" type="button" onClick={() => navigate("profile")}>
                Оставить аккаунт
              </button>
            ) : null}
          </section>
          <section className="state-note panel">
            <span className="eyebrow">Lottie · 56–80 px</span>
            <strong>Анимация помогает, но не задерживает действие</strong>
            <p>Каждое состояние объясняет причину и оставляет один очевидный следующий шаг.</p>
          </section>
        </main>
      </div>
    );
  };

  const screens: Record<Screen, () => React.ReactNode> = {
    home:
      designId === "ledger" ? renderLedgerHome
      : designId === "twins" ? renderTwinsHome
      : designId === "wartable" ? renderWarTableHome
      : designId === "signal" ? renderSignalHome
      : renderHome,
    heroes:
      designId === "ledger" ? renderLedgerHeroes
      : designId === "twins" ? renderTwinsHeroes
      : designId === "wartable" ? renderWarTableHeroes
      : designId === "signal" ? renderSignalHeroes
      : renderHeroes,
    photo:
      designId === "ledger" ? renderLedgerPhoto
      : designId === "twins" ? renderTwinsPhoto
      : designId === "wartable" ? renderWarTablePhoto
      : designId === "signal" ? renderSignalPhoto
      : renderPhoto,
    analysis:
      designId === "ledger" ? renderLedgerAnalysis
      : designId === "twins" ? renderTwinsAnalysis
      : designId === "wartable" ? renderWarTableAnalysis
      : designId === "signal" ? renderSignalAnalysis
      : renderAnalysis,
    result:
      designId === "ledger" ? renderLedgerResult
      : designId === "twins" ? renderTwinsResult
      : designId === "wartable" ? renderWarTableResult
      : designId === "signal" ? renderSignalResult
      : renderResult,
    history:
      designId === "ledger" ? renderLedgerHistory
      : designId === "twins" ? renderTwinsHistory
      : designId === "wartable" ? renderWarTableHistory
      : designId === "signal" ? renderSignalHistory
      : renderHistory,
    profile:
      designId === "ledger" ? renderLedgerProfile
      : designId === "twins" ? renderTwinsProfile
      : designId === "wartable" ? renderWarTableProfile
      : designId === "signal" ? renderSignalProfile
      : renderProfile,
    auth:
      designId === "ledger" ? renderLedgerAuth
      : designId === "twins" ? renderTwinsAuth
      : designId === "wartable" ? renderWarTableAuth
      : designId === "signal" ? renderSignalAuth
      : renderAuth,
    plans:
      designId === "ledger" ? renderLedgerPlans
      : designId === "twins" ? renderTwinsPlans
      : designId === "wartable" ? renderWarTablePlans
      : designId === "signal" ? renderSignalPlans
      : renderPlans,
    states:
      designId === "ledger" ? renderLedgerStates
      : designId === "twins" ? renderTwinsStates
      : designId === "wartable" ? renderWarTableStates
      : designId === "signal" ? renderSignalStates
      : renderStates,
  };

  const showTabs = ["home", "history", "profile", "plans", "result"].includes(screen);

  return (
    <div className={`counterpick-prototype design-${design.id} theme-${theme}`}>
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => handlePhoto(event.target.files?.[0])}
      />

      <div className="mobile-prototype-bar">
        <label>
          <span className="visually-hidden">Дизайн</span>
          <select value={designId} onChange={(event) => setDesignId(event.target.value)}>
            {designs.map((item) => <option value={item.id} key={item.id}>{item.index} · {item.name}</option>)}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Экран</span>
          <select value={screen} onChange={(event) => navigate(event.target.value as Screen)}>
            {screenOptions.map((item) => <option value={item.id} key={item.id}>{item.short}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} aria-label="Сменить тему">
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </div>

      <div className="prototype-layout">
        <aside className="design-rail">
          <div className="lab-brand">
            <span className="lab-mark"><Shield size={19} /></span>
            <span><strong>Counterpick</strong><small>5 UI directions</small></span>
          </div>
          <div className="rail-heading">
            <span>Визуальные системы</span>
            <strong>Выберите характер</strong>
          </div>
          <div className="design-list">
            {designs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={designId === item.id ? "is-selected" : ""}
                  type="button"
                  key={item.id}
                  onClick={() => setDesignId(item.id)}
                  aria-pressed={designId === item.id}
                >
                  <span className="design-number">{item.index}</span>
                  <span className="design-icon"><Icon size={18} /></span>
                  <span className="design-copy"><strong>{item.name}</strong><small>{item.subtitle}</small></span>
                  <span className="design-swatches">
                    {item.colors.map((color) => <i style={{ background: color }} key={color} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rail-footer">
            <span>Тема</span>
            <div className="desktop-theme-toggle">
              <button className={theme === "light" ? "is-selected" : ""} type="button" onClick={() => setTheme("light")}>
                <Sun size={16} /> Светлая
              </button>
              <button className={theme === "dark" ? "is-selected" : ""} type="button" onClick={() => setTheme("dark")}>
                <Moon size={16} /> Тёмная
              </button>
            </div>
          </div>
        </aside>

        <main className="prototype-stage">
          <div className="stage-label">
            <div>
              <span>LIVE PROTOTYPE · {design.index}</span>
              <strong>{design.name}</strong>
            </div>
            <span className="viewport-chip"><span /> 390 × 844</span>
          </div>
          <div className="phone-shadow">
            <div className="phone-frame">
              <div className="device-status">
                <span>9:41</span>
                <span className="device-island" />
                <span><WifiOff size={12} className="status-offline-icon" /> 5G · 82%</span>
              </div>
              <div className="app-viewport" key={`${design.id}-${screen}`}>
                {screens[screen]()}
              </div>
              {showTabs ? <TabBar screen={screen} onNavigate={navigate} designId={designId} /> : null}
              {toast ? <div className="toast" role="status"><CheckCircle2 size={16} />{toast}</div> : null}
            </div>
          </div>
        </main>

        <aside className="prototype-inspector">
          <div className="inspector-top">
            <span className="inspector-kicker">НАПРАВЛЕНИЕ {design.index}</span>
            <h2>{design.subtitle}</h2>
            <p>{design.thesis}</p>
          </div>
          <section className="inspector-section">
            <div className="inspector-title">
              <span>Экраны</span>
              <small>{currentScreen.label}</small>
            </div>
            <div className="screen-grid">
              {screenOptions.map((item) => (
                <button
                  className={screen === item.id ? "is-selected" : ""}
                  type="button"
                  onClick={() => navigate(item.id)}
                  key={item.id}
                >
                  <span>{item.short}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </section>
          <section className="inspector-section">
            <div className="inspector-title">
              <span>Служебные состояния</span>
              <small>Lottie</small>
            </div>
            <div className="state-shortcuts">
              {states.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setSelectedState(item.id);
                      navigate("states");
                    }}
                    aria-label={item.label}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="inspector-meta">
            <span><ScanLine size={15} /> Responsive</span>
            <span><Sparkles size={15} /> Motion-ready</span>
            <span><Shield size={15} /> Light / dark</span>
          </section>
        </aside>
      </div>
    </div>
  );
}
