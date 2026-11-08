const FLY_MS = 520;

// A copy of the photo flies from the card into the basket, so it's plain where
// the item went.
export default function flyToBasket(photo) {
  const basket = document.querySelector(".dk-basket");
  if (
    !photo ||
    !basket ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  const from = photo.getBoundingClientRect();
  const to = basket.getBoundingClientRect();
  const copy = photo.cloneNode(true);
  Object.assign(copy.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: 0,
    zIndex: 50,
    pointerEvents: "none",
  });
  document.body.append(copy);
  const dx = to.left + 60 - from.left - from.width / 2;
  const dy = to.top + 60 - from.top - from.height / 2;
  const flight = copy.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.15) rotate(8deg)`, opacity: 0.5 },
    ],
    { duration: FLY_MS, easing: "cubic-bezier(.5, 0, .3, 1)" }
  );
  flight.onfinish = () => copy.remove();
  flight.oncancel = () => copy.remove();
}
