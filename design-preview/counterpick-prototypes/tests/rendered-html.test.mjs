import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Counterpick prototype", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Counterpick — 5 UI directions<\/title>/i);
  assert.match(html, /Найдём пик, который меняет драфт/);
  assert.match(html, /Aegis Aperture/);
  assert.match(html, /Match Signal/);
  assert.match(html, /Патч 7\.41d/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the complete interactive showcase surface", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const screen of [
    "Главная",
    "Выбор героя",
    "Проверка фото",
    "Анализ",
    "Результат",
    "История",
    "Профиль",
    "Вход и регистрация",
    "Counterpick Pro",
    "Состояния",
  ]) {
    assert.match(page, new RegExp(screen));
  }

  assert.match(page, /lottie-react/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  for (const design of ["Ledger", "Twins", "WarTable", "Signal"]) {
    for (const screen of ["Home", "Heroes", "Photo", "Analysis", "Result", "History", "Profile"]) {
      assert.match(page, new RegExp(`render${design}${screen}`));
    }
  }
  for (const structure of [
    "ledger-document",
    "twins-board",
    "wartable-map-field",
    "signal-scoreboard",
    "tab-bar-ledger",
    "tab-bar-twins",
    "tab-bar-wartable",
    "tab-bar-signal",
  ]) {
    assert.match(styles, new RegExp(`\\.${structure}`));
  }
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
});
