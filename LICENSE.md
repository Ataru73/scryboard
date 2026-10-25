# Scryboard License

Copyright (C) 2026 Scryboard Contributors

This repository contains both software source code and third-party creative assets, which are licensed separately as detailed below.

---

## 1. Source Code License (GNU AGPLv3)

All source code in this repository (including `apps/server`, `apps/web`, `packages/shared`, `e2e`, and `scripts`, excluding the third-party portrait assets noted in Section 2) is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version (`AGPL-3.0-or-later`).

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of **MERCHANTABILITY** or **FITNESS FOR A PARTICULAR PURPOSE**. See the GNU Affero General Public License for more details.

### Key Summary of Terms under AGPLv3 (Informational Only)

- **Freedom to Use & Self-Host:** You are free to run Scryboard privately or publicly for your own RPG group, modify the source code, and distribute unmodified or modified copies.
- **Network Copyleft (Section 13):** If you modify Scryboard and run it on a server where users interact with it remotely over a computer network (for example, as a hosted VTT service or public instance), your modified version **must** prominently offer all users interacting with it remotely an opportunity to receive the Complete Corresponding Source code of your modified version under the GNU AGPLv3.
- **License Preservation:** Any redistributed or derivative versions must retain all copyright notices, attribution credits (`apps/web/src/pages/Credits.tsx`), and this license under the same AGPLv3 terms.

---

## 2. Third-Party Portrait Assets License (CC BY 3.0)

The SVG portrait files located in `assets/portraits/*.svg` and their generated vector paths in `apps/web/src/board/portraits.gen.ts` are **not** covered by the GNU AGPLv3.

Instead, those icons are provided by **[Game-icons.net](https://game-icons.net/)** (created by Lorc, Delapouite, Caro Asercion, Skoll, Cathelineau, Guard13007, DarkZaitzev, HeavenlyDog, and Carl Olsen) and are licensed under the **[Creative Commons Attribution 3.0 Unported (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/)** license.

See [`assets/portraits/LICENSE.md`](./assets/portraits/LICENSE.md) and the in-app `/credits` page (`apps/web/src/pages/Credits.tsx`) for the complete per-icon attribution table.

---

## 3. Full Text of the GNU Affero General Public License v3.0

Because the Free Software Foundation requires the verbatim text of the GNU AGPLv3 to be included unaltered, you can obtain the complete official text at:
- **Official URL:** <https://www.gnu.org/licenses/agpl-3.0.txt>
- **SPDX Identifier:** `AGPL-3.0-or-later`

> **Tip for GitHub License Badge Detection:**
> If you want GitHub to automatically display the **"AGPL-3.0 license"** badge in the top-right sidebar of your repository, fetch the exact plaintext file directly into the root of your repo as `LICENSE` (and keep the dual-license Section 1 & 2 explanation in your `README.md`):
>
> ```bash
> curl -sL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
> ```
