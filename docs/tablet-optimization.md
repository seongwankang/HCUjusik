# Tablet optimization

The site uses the same URL and account on desktop, iPad and Android tablets. No installation or new Firebase permissions are required.

- Up to 1200px: navigation wraps into touch-sized rows, the instrument rail gives its width to trading, portfolio tables scroll inside their panel, and rankings/admin panels stack.
- Portrait order forms put price and quantity alongside each other where space permits. Landscape keeps chart/order panels side by side.
- Coarse-pointer devices get 44px controls, 16px-or-larger inputs, numeric keyboards for order fields, tap-to-inspect candles, native vertical chart scrolling and pinch zoom. Dialog height follows the visible viewport; safe-area padding avoids cutouts.
- News no longer blocks the initial shell. Order controls no longer wait for the separate management-history request; older responses cannot overwrite a newer refresh. Quote bursts share one animation-frame repaint, and candle date formatters are reused.

Validation: unit tests cover deferred news, account changes, quote batching, order/history request ordering and existing candle/financial behavior. Browser fixtures exercise the actual trading components with synthetic data at 768x1024, 800x1280, 820x1180, 1180x820 and 1280x800. The fixture activates the same coarse-pointer CSS to check touch dimensions and compares page/viewport widths. Fixtures and screenshots are local only and are not shipped.

This is browser layout validation, not a physical-device benchmark. On an iPad/Samsung tablet, check portrait/landscape rotation, opening/closing the keyboard in login and order fields, chart tap versus vertical scroll, and horizontal portfolio-table scrolling. Network latency and Firebase reads still affect loading; transaction authorization and matching remain unchanged.
