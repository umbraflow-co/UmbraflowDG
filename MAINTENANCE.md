# Maintenance notes

## Run the checks

```bash
node tools/check.mjs
```

No install step, just Node 18 or newer. The script reads the source files and fails if something that's duplicated or load-bearing has drifted. It can't open Discord or Garry's Mod, so it won't tell you a Discord class got renamed. The manual checks below cover that part.

## Things that are copied in more than one place

- **GMod color tokens.** `Menu.css`, `Workshop.css` and `Creations.css` each carry the full `:root` block. `loading.css` and `awesomium_global.css` carry a smaller subset because they load in their own documents. Change a color in all of them at once. The check compares every copy against `Menu.css`.
- **Server list row height.** The virtual scroll assumes 22px rows in `Servers.css`, `control.Servers.js` and twice in `template/servers.html`. Change all four or the list jumps while you scroll.
- **Version number.** Every GMod file header and the console banner in `control.Menu.js` should say the same version. The Discord theme has its own version in its `@version` header.

## Garry's Mod updates

`control.Menu.js`, `control.Servers.js` and `template/servers.html` replace Facepunch's files outright. When GMod starts calling a new menu function, the menu breaks until we add it, which is what happened with `ResetGamemodeInfo()`. After a GMod update, compare against [Facepunch/garrysmod](https://github.com/Facepunch/garrysmod/tree/master/garrysmod/html) and copy over any new functions. The check keeps a list of the functions the engine calls. Add new ones to it.

Leave the in-game overlay fonts in `SourceScheme.res` stock. `DefaultFixedOutline` and `DefaultVerySmall` are what `net_graph` and `cl_showfps` draw with, and the themed versions were tiny and flickered.

User-facing text in the menu goes through `ng-Localize` with a phrase GMod already ships (see `resource/localization/en/main_menu.properties`), so it gets translated for free.

## Discord class renames

Discord's class names look like `word_hash` and the hash changes between builds, so every selector is a `[class*="word_"]` substring match. When something stops being themed, open DevTools (Vencord settings, or Ctrl+Shift+I), find the new class fragment, and update the selector. Keep the trailing underscore so you don't match longer names like `menuItem`.

For UmbraMotion, every selector lives in `UmbraMotion/modules.ts`. Its README lists which modules have been confirmed against a live client.

## Before a release, by hand

- Discord: switch between Light, Dark and Onyx. Open a context menu, a modal, a profile (including the profile editor's save bar), and the emoji picker.
- GMod: open the main menu, the server browser (select a server, try a passworded one), the recent-servers flyout, and a loading screen. Turn on `net_graph 1` in a game.
