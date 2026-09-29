# Architecture

## Layers

1. **Market Data** — `src/binance.js`: Spot/Futures REST, symbol discovery, Klines, resilient WebSocket reconnects and cached fallback.
2. **Chart Engine** — `src/chart.js`: Canvas financial rendering, viewport, price/time transforms, chart types, indicator panes, markers and crosshair synchronization.
3. **Drawing Engine** — `src/drawings.js`: interactive objects, anchor hit-testing, snapping, undo/redo and serializable persistence.
4. **Technical Analysis** — `src/ta.js`: vector indicators calculated client-side.
5. **Script Runtime** — `src/scripts.js`: user JavaScript executes in a dedicated Web Worker and is terminated on timeout. No DOM access.
6. **Strategy Engine** — `src/backtest.js`: next-bar execution model, fees, slippage, stop/take, long/short, equity and statistics.
7. **Replay** — `src/replay.js`: timeline controller. Other timeframes resolve the same timestamp into their own bar index.
8. **Scanner** — `src/scanner.js`: Binance 24-hour ticker universe and sortable USDT view.
9. **Paper Broker** — `src/paper.js`: local simulated positions, stops/takes and realized/unrealized PnL.
10. **Persistence** — `src/storage.js`: IndexedDB stores workspace, scripts, drawings, alerts, paper account and cached market data.
11. **Application shell** — `src/app.js`: UI coordination only; market/chart/script engines remain separable.

## Security boundary for My Scripts

Scripts run in Web Workers, not the UI thread. Network globals are disabled in the worker and execution has a hard timeout. This protects the main interface from accidental infinite loops and prevents scripts from directly accessing the DOM. It is a practical sandbox for personal scripts, not a formal hostile-code security VM.

## Data ownership

Workspace state is local-first. Export/Import produces a portable JSON backup. No application account, analytics SDK, paid API or external database is required.
