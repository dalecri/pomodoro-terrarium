# Pomodoro Terrarium

A cozy pomodoro timer where an isometric voxel garden island grows while you work. The island has a dusky-mauve sky, indigo grass, a little cabin with chimney smoke, a lily pond and old blossom trees. Reimagined from
[typing-speed-terrarium](https://github.com/dalecri/typing-speed-terrarium).

- **Focus**: a mystery seed sprouts and grows a block at a time as the timer runs, then blooms when it finishes.
- **Stop early**: the sprout wilts. If you stop in the first minute, the seed just goes back in your pocket.
- **Finish a task**: it revives a wilted sprout, or pops up something small like a mushroom, moss or a tulip.
- **Short break**: dusk, with a rain cloud watering the jar. **Long break**: night, with stars, fireflies and crickets.
- **Every 4th pomodoro** grows a cherry blossom tree.
- **Critter journal**: butterflies, a snail, a ladybug, fireflies, a frog. Each has its own milestone.
- **Hover any plant** to see which task it grew during. Drag to turn the island; double-click to reset.
- **Garden album**: when the island fills up (93 plots), save a snapshot to the album and start fresh.
- **Coins & shop**: each finished task earns 2 coins and each bloom earns 3. Spend them in the garden shop (press <kbd>S</kbd>):
  - **Flowers** (6 to 25 coins): lavender, cactus, rose, lily of the valley, Venus flytrap, a glowing moonflower, bonsai, rainbow tulip. Each one is planted right away.
  - **Critters** (15 to 45 coins): a bumblebee, a bunny, a night owl on the fence, and a sleepy cat on the cabin roof.
  - **Accents** (10 to 35 coins): mossy boulders, a lamp post, a garden gnome, fairy lights, and a hot-air balloon.
  - Critters and accents are yours to keep, and you can put them away and bring them back.

Everything is saved in `localStorage`, including a running timer, so you can close the tab and come back.

## Run

```bash
python -m http.server 5179
```

Then open http://localhost:5179. Add `?speed=60` to make a minute pass every second for demos.

Keys: <kbd>Space</kbd> start/pause · <kbd>N</kbd> new task · <kbd>Esc</kbd> close panels (mobile).
