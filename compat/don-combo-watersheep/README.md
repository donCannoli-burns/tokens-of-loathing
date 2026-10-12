# don_combo × WaterSheep deterministic lab

This compatibility lab turns the existing `tokens-of-loathing` +
`kolmafia-mock` verification stack into an offline test world for the
`don_combo` WaterSheep shadow runtime.

It deliberately does **not** become part of live Combo execution.

## Runtime split

```text
live KoLmafia
  ASH / JS / Libram / don_combo
        ↓
  WaterSheep shadow score
        ↓
      receipt

offline lab
  frozen tokens-of-loathing SQLite snapshot
        +
  pinned kolmafia-mock
        +
  kol.js pure utilities
        ↓
  explicit labeled evidence fixtures
        ↓
  the same WaterSheep evidence contract
        ↓
  accuracy / Brier / ECE / latency / order sensitivity
```

The shared model-facing contract is:

```text
don-combo-watersheep-evidence/v1
```

Benchmark truth is held outside the model request. Known rare annotations,
Combo route identity, candidate source labels, and baseline membership are not
inserted into the WaterSheep state.

## Materialize the lab

```bash
bash compat/don-combo-watersheep/materialize.sh \
  --lab-dir /tmp/don-combo-watersheep
```

This always:

1. calls the existing `compat/kolmafia-mock/materialize.sh`;
2. verifies the pinned upstream mock against the local SQLite-backed client;
3. overlays the lab into the disposable mock;
4. installs `kol.js` only inside that disposable checkout;
5. resolves known beach-run items through the frozen SQLite corpus;
6. verifies the mock returns the same item IDs;
7. verifies the labeled fixtures project into the shared model contract without
   benchmark-truth leakage.

No WaterSheep process is required for this substrate smoke.

## Run WaterSheep

With the local model server available:

```bash
bash compat/don-combo-watersheep/materialize.sh \
  --lab-dir /tmp/don-combo-watersheep \
  --watersheep http://127.0.0.1:8766/v1/systemone
```

To require compatibility with an exported live runtime:

```bash
bash compat/don-combo-watersheep/materialize.sh \
  --lab-dir /tmp/don-combo-watersheep \
  --watersheep http://127.0.0.1:8766/v1/systemone \
  --live-runtime ~/.kolmafia/data/don_combo_matrix_runtime.json
```

The benchmark refuses to compare against a runtime whose
`watersheep.evidence_contract` differs.

Optional cyclic option-order check:

```bash
bash compat/don-combo-watersheep/materialize.sh \
  --lab-dir /tmp/don-combo-watersheep \
  --watersheep http://127.0.0.1:8766/v1/systemone \
  --order-check
```

## Outputs

The materialization root contains:

```text
lab-manifest.json
mock/
  .kolmafia-mock-compat/
    compat-manifest.json
    dol.sqlite
results/
  report.json
  cases.jsonl
```

`report.json` records:

- SQLite SHA-256 and database revision/update metadata;
- tokens-of-loathing and pinned mock provenance;
- the evidence-contract version;
- model endpoint and scenario count;
- overall and per-class accuracy;
- multiclass mean Brier score;
- 10-bin expected calibration error;
- mean latency;
- optional cyclic option-order flip rate;
- the actual corpus item IDs used by the smoke.

## Scenario policy

The six benchmark classes are explicit fixtures:

```text
rare / whale / sandcastle / twinkle / regular / scratched
```

They are not inferred from the SQLite corpus. The corpus proves that the KoL
world entities used by the test exist and agree with the materialized mock.
The labeled evidence vectors are test inputs whose truth is known by
construction.

That keeps the evidence levels separate:

```text
FACT   corpus entity / mock parity / fixture label
MODEL  WaterSheep score mass
POLICY deterministic metric calculation and authority boundary
```

A benchmark PASS or a high model score grants no live KoL authority.
