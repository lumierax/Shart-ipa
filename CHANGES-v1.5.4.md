# BCS Chart Studio v1.5.4 — iPhone layout correction

This release corrects the mobile layout after testing the signed IPA on a real iPhone.

## What changed

- Fixed the iOS safe-area strategy: Capacitor now uses `contentInset: never` and CSS owns the safe areas. This prevents the native inset and CSS inset from being applied twice.
- The chart now has a real viewport that ends **above** the fixed iPhone controls. The action/navigation bars no longer cover the canvas.
- Volume is therefore visible again at the bottom of the chart, directly above the time axis and controls.
- Increased mobile volume opacity and gave it a bounded overlay height so it remains readable without dominating price candles.
- Reduced the chart action bar to frequent actions only: Undo, Redo, More, Draw, Timeframe, Symbol.
- Moved Fit and Share into the More / Analysis sheet so the action strip never overflows horizontally.
- The symbol button now flexes into remaining width instead of extending off-screen.
- Reduced bottom-navigation height, icon size and label size.
- Bottom navigation now follows a more familiar mobile trading order: Watchlist, Chart, Scanner, Scripts, More.
- More and drawing tools still open as draggable bottom sheets; only sheet content scrolls.
- Price-axis width/font are tuned for narrow screens.
- Current top price text follows candle direction (green/red).
- Replay remains positioned above all mobile controls.
- Landscape gets its own compact heights.

## Not changed

- Binance data engine
- 49 built-in indicators / BCS Pro
- Heikin Ashi calculations
- Replay engine
- Backtest engine
- Drawing engine and Long/Short tools
- Desktop layout

## Tests

`npm test` covers the 49 indicators/core engine and verifies the mobile viewport, safe-area configuration, bottom sheets, volume area, drawing button and More actions.
