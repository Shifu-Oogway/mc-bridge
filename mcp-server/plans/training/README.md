# Training plans (data collection for the local model)

Plans for `ollama-agent.js --teacher`: Claude Code plays them and every step attempt is recorded as a training episode.
They start from an **empty inventory**, use **no coordinates** (everything is found with `mc_find_blocks`), and check
progress with **`gain`** (items gained since the step started), so the same plan can be replayed on the same world
again and again without its steps being skipped as "already satisfied".

| Plan | What it teaches | Main checks |
|---|---|---|
| `t01-wood` | trees, 2x2 crafting, placing and using a crafting table | logs, planks, sticks, table, wooden pickaxe |
| `t02-stone` | mining stone, 3x3 crafting | cobblestone, stone pickaxe + axe, furnace |
| `t03-charcoal-torches` | furnace slots, smelting, waiting | charcoal, torches |
| `t04-iron` | searching for ore, tunnelling, smelting | raw iron, iron ingots |
| `t05-andesite-alloy` | first Create material | andesite, nuggets, andesite alloy |
| `t06-create-parts` | Create crafting | shafts, cogwheels, hand crank |
| `t07-millstone` | in-world item use, first working machine | andesite casing, millstone, gravel |
| `s01-platform` | block placement (verified with `mc_blocks`) | |
| `s02-storage` | chests, moving items with `mc_click_slot` | chest |
| `s03-stairs-down` | digging and moving underground | |

Steps named "have ..." use absolute `inventory` checks: they are skipped when you already have the item and make it
when you don't, so later plans also work on their own. Steps with only a `verify` sentence are accepted when the model
confirms in the world and says DONE (weaker labels than item checks).

## Running

Connect to the game first (`../../connect-remote.sh ...`), then from `mcp-server/`:

```
# one plan
node ollama-agent.js --teacher --instance remote --exclude "$EXCLUDE" --plan plans/training/t01-wood.json

# the whole curriculum in order (roadmap mode edits its file, so run a copy; --max-auto 0 = never invent plans)
cp plans/training/curriculum.json ../run-logs/curriculum-run.json
node ollama-agent.js --teacher --instance remote --exclude "$EXCLUDE" --roadmap ../run-logs/curriculum-run.json --max-auto 0
```

with

```
EXCLUDE="mc_settlement_status,mc_task_start,mc_task_status,mc_task_cancel,mc_task_resume,mc_blueprint,mc_checkpoint,mc_fill"
```

Those tools belong to the settlement project or need game commands (off in this world). Hiding them keeps the prompt
smaller and the student from calling tools it can't use. **Use the same `--exclude` when the student runs later**: the
tool list is part of the prompt it was trained on (`tools_hash` in each episode).

Do not pass `--directive` for training runs; it changes the system prompt that gets recorded.

## Tips

- Set the world to **Peaceful** (Options -> Difficulty on the game computer) so mobs and night don't kill runs.
- Teacher model: use the default `sonnet` from t02 on. `haiku` handles t01 perfectly but recovers badly when things go
  wrong (in t02 run 1 it got stuck in a lake for 44 calls and drowned), and recoveries are exactly what the student must learn.
- The runner stops the whole run if the character dies or its health drops below 6 (`died` / `low_health` events,
  never exported). After a death, click Respawn in the game and rerun.
- Run each plan several times. The same plan in a different spot (new trees, other terrain) gives different episodes;
  `export-sft.js` drops exact duplicates and keeps at most 20 episodes per step.
- Check the yield now and then: `node export-sft.js ../run-logs/trajectories --out ../run-logs/sft` and read
  `../run-logs/sft/report.json`.
- The human stop keys (W, A, S, D, Space, Esc) work in the game window: touching them stops the run.
