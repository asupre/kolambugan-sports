// Shared DepthCarousel settings for the public Players and Teams pages, so the
// two stay in step. `wide` = min-width 640px. Phone values are the measured,
// lag-free ones (see CLAUDE.md): full width (no arrow padding), no blur.
export function posterCarouselProps(wide) {
  return {
    cardWidth: wide ? 270 : 250,
    cardHeight: wide ? 360 : 333,
    spread: wide ? 115 : 34,
    depth: wide ? 200 : 150,
    tilt: wide ? 22 : 14,
    visibleCards: wide ? 4 : 3,
    blur: 0,
    falloff: 0.13,
    showControls: wide,
    sidePadding: wide ? 120 : 0,
  };
}
