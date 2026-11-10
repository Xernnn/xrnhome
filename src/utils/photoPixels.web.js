export const PIXEL_SIDE = 48;

// RGBA pixels of a tiny copy of a photo. Photos come from the page's own server,
// so a canvas may read them.
export const photoPixels = (uri) =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PIXEL_SIDE;
      canvas.height = PIXEL_SIDE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, PIXEL_SIDE, PIXEL_SIDE);
      resolve(context.getImageData(0, 0, PIXEL_SIDE, PIXEL_SIDE).data);
    };
    image.onerror = () => reject(new Error("The photo did not load"));
    image.src = uri;
  });
