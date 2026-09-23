// Umbraflow regression checks. No dependencies: `node tools/check.mjs`.
//
// These guard the things that have broken before or that silently drift
// because they are duplicated across files. They are static checks on the
// source, not a browser run, so they can't tell you whether a Discord class
// name still exists. See MAINTENANCE.md for what to test by hand.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

let failures = 0;
let passes = 0;

function check(name, ok, detail = "") {
    if (ok) {
        passes++;
        return;
    }
    failures++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
}

// Custom properties declared anywhere in a stylesheet, as name -> value.
function declaredVars(css) {
    const vars = new Map();
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
    return vars;
}

function usedVars(css, prefix = "--") {
    return new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]).filter(v => v.startsWith(prefix)));
}

// The first `:root { ... }` block of a stylesheet, as name -> value.
function rootTokens(css) {
    const block = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    return block ? declaredVars(block[1]) : new Map();
}

// ---------------------------------------------------------------- Discord

const discord = read("Discord-Themes/umbraflow.theme.css");

for (const tag of ["@name", "@description", "@author", "@version"]) {
    check(`Discord: BetterDiscord header has ${tag}`, new RegExp(`^ \\* ${tag} `, "m").test(discord.slice(0, 400)));
}

{
    const declared = declaredVars(discord);
    const missing = [...usedVars(discord, "--fluenty-")].filter(v => !declared.has(v));
    check("Discord: every --fluenty-* variable in use is declared", !missing.length, missing.join(", "));
}

// A bare substring match on layer_ also hits player_* elements.
check("Discord: layer_ is matched as a class prefix, not a substring", !/\[class\*="layer_"\]/.test(discord));

check("Discord: Light override block exists", /^\.theme-light \{/m.test(discord));
check("Discord: Onyx override block exists", /^\.theme-midnight \{/m.test(discord));

// Derived tokens only re-resolve per palette if every base block is also
// declared on the theme classes, not just :root.
{
    const heads = [...discord.matchAll(/^:root,\n([^{]*)\{/gm)].map(m => m[1]);
    const bad = heads.filter(h => !["theme-dark", "theme-light", "theme-midnight"].every(t => h.includes(`.${t}`)));
    check("Discord: base token blocks cover .theme-dark/.theme-light/.theme-midnight", heads.length > 0 && !bad.length);
}

// ---------------------------------------------------------------- Garry's Mod

const GM = "Gmod-Theme/html/";
const menuCss = read(`${GM}css/menu/Menu.css`);
const canonical = rootTokens(menuCss);

// Menu, Workshop and Creations each carry the full token block. Loading and
// the global sheet load in their own documents and carry a subset.
for (const file of ["css/Workshop.css", "css/creations/Creations.css", "loading.css", "awesomium_global.css"]) {
    const tokens = rootTokens(read(GM + file));
    const drift = [...tokens].filter(([k, v]) => canonical.has(k) && canonical.get(k) !== v).map(([k, v]) => `${k}: ${v} (Menu.css: ${canonical.get(k)})`);
    const extra = [...tokens.keys()].filter(k => !canonical.has(k));
    check(`GMod: ${file} tokens match Menu.css`, !drift.length && !extra.length, [...drift, ...extra.map(k => `${k} is not in Menu.css`)].join("; "));
}

for (const file of ["css/Workshop.css", "css/creations/Creations.css"]) {
    const tokens = rootTokens(read(GM + file));
    const missing = [...canonical.keys()].filter(k => !tokens.has(k));
    check(`GMod: ${file} carries the full token set`, !missing.length, missing.join(", "));
}

// Standalone documents can't borrow Menu.css's :root.
for (const file of ["loading.css", "awesomium_global.css"]) {
    const css = read(GM + file);
    const declared = declaredVars(css);
    const missing = [...usedVars(css)].filter(v => !declared.has(v));
    check(`GMod: ${file} declares every variable it uses`, !missing.length, missing.join(", "));
}

// The server list's virtual scroll assumes one fixed row height in three places.
{
    const css = read(`${GM}css/menu/Servers.css`).match(/\.serverlist \.server \{[^}]*\n\s*height:\s*(\d+)px/);
    const js = read(`${GM}js/menu/control.Servers.js`).match(/elem\.scrollTop \/ (\d+)/);
    const html = [...read(`${GM}template/servers.html`).matchAll(/ \* (\d+)\}\}px/g)].map(m => m[1]);
    const heights = new Set([css?.[1], js?.[1], ...html]);
    check("GMod: server row height agrees across CSS, JS and template", css && js && html.length === 2 && heights.size === 1, `found ${[...heights].join(", ")}`);
}

// Header versions and license wording.
{
    const files = [
        "awesomium_global.css", "loading.css", "menu.html",
        "css/Workshop.css", "css/creations/Creations.css",
        "css/menu/Menu.css", "css/menu/NavBar.css", "css/menu/NewGame.css", "css/menu/PageOptions.css", "css/menu/Servers.css",
        "js/menu/control.Menu.js", "js/menu/control.Servers.js"
    ].map(f => GM + f).concat("Gmod-Theme/resource/SourceScheme.res");

    const versions = new Set();
    for (const f of files) {
        const text = read(f);
        const v = text.match(/Created by Big_Killers\s+·\s+v(\d+\.\d+\.\d+)/);
        check(`GMod: ${f} has a versioned header`, !!v);
        if (v) versions.add(v[1]);
        check(`GMod: ${f} header matches the MIT license`, !/All rights reserved/i.test(text));
    }
    const banner = read(`${GM}js/menu/control.Menu.js`).match(/Made by Big_Killers \| v(\d+\.\d+\.\d+)/);
    if (banner) versions.add(banner[1]);
    check("GMod: every file (and the console banner) states the same version", versions.size === 1, [...versions].join(", "));
}

// The recent-servers flyout should go through ng-Localize, not hard-coded English.
{
    const menu = read(`${GM}menu.html`);
    const flyout = menu.match(/<div id="RecentServers"[\s\S]*?<\/div>\s*\n\s*<div class="group center">/)?.[0] ?? "";
    check("GMod: recent-servers flyout has no hard-coded English", flyout && !/>\s*(Loading|Recent)[^<]*</.test(flyout));
    check("GMod: no CSS content strings for user-facing labels", !/content:\s*'[A-Za-z]{3,}/.test(read(`${GM}css/menu/NavBar.css`)));
}

// net_graph and cl_showfps draw with these over the game world. The themed
// versions came out tiny and shimmered, so they must stay stock.
{
    const scheme = read("Gmod-Theme/resource/SourceScheme.res");
    const font = name => scheme.match(new RegExp(`\\t\\t"${name}"\\n\\t\\t\\{([\\s\\S]*?)\\n\\t\\t\\}`))?.[1] ?? "";
    const outline = font("DefaultFixedOutline");
    const small = font("DefaultVerySmall");
    check("GMod: DefaultFixedOutline (net_graph) is stock Lucida Console 10",
        /"name"\s+"Lucida Console" \[\$WINDOWS\]/.test(outline) && /"tall"\s+"10"/.test(outline) && !/antialias/.test(outline));
    check("GMod: DefaultVerySmall (net_graph) is stock Tahoma 12",
        /"name"\s+"Tahoma" \[\$WINDOWS\]/.test(small) && /"tall"\s+"12"/.test(small) && !/antialias/.test(small));
}

// Functions the engine calls into the menu by name. Losing one crashes the
// menu (ResetGamemodeInfo went missing once after a GMod update).
{
    const js = read(`${GM}js/menu/control.Menu.js`) + read(`${GM}js/menu/control.Servers.js`);
    const engineCalls = [
        "SetInGame", "SetShowFavButton", "UpdateGamemodes", "UpdateCurrentGamemode", "GetGamemodeInfo",
        "ResetGamemodeInfo", "UpdateAddonMaps", "UpdateMaps", "UpdateLanguages", "UpdateLanguage", "UpdateGames",
        "UpdateVersion", "SetProblemCount", "FinishedServers", "AddServer", "UpdateServer", "SetPlayerList",
        "ReceiveFoundServers"
    ];
    const missing = engineCalls.filter(fn => !new RegExp(`^function ${fn}\\s*\\(`, "m").test(js));
    check("GMod: engine-facing menu functions are all defined", !missing.length, missing.join(", "));
}

{
    const html = read(`${GM}loading.html`);
    const missing = ["GameDetails", "DownloadingFile", "SetStatusChanged"].filter(fn => !html.includes(`function ${fn}(`));
    check("GMod: loading screen implements the engine callbacks", !missing.length, missing.join(", "));
}

// ---------------------------------------------------------------- UmbraMotion

{
    const modules = read("UmbraMotion/modules.ts");
    const keys = [...modules.matchAll(/^\s+key: "(\w+)"/gm)].map(m => m[1]);
    check("UmbraMotion: module keys are unique", new Set(keys).size === keys.length, keys.join(", "));

    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
    const claimed = read("UmbraMotion/README.md").match(/^(\w+) places in Discord/m)?.[1]?.toLowerCase();
    check("UmbraMotion: README module count matches modules.ts", words.indexOf(claimed) === keys.length, `README says ${claimed}, modules.ts has ${keys.length}`);
}

// ---------------------------------------------------------------- Repo

{
    const readme = read("README.md");
    const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]).filter(p => !/^https?:/.test(p));
    const missing = images.filter(p => {
        try { readFileSync(join(ROOT, p)); return false; } catch { return true; }
    });
    check("README: every local image exists", !missing.length, missing.join(", "));
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
