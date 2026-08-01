/**
 * Live2D Cubism Core (CDN / SDK 5+) renamed drawables.renderOrders → drawOrders.
 * pixi-live2d-display still reads renderOrders, so without this alias the model
 * loads but CubismRenderer crashes / only draws a couple of meshes.
 */
(function patchCubismRenderOrders() {
  const Core = window.Live2DCubismCore;
  if (!Core?.Model?.fromMoc) {
    console.error("[Enerva] Live2DCubismCore missing — check live2dcubismcore.min.js");
    return;
  }

  const patchDrawables = (model) => {
    const drawables = model?.drawables;
    if (!drawables) return model;
    if (drawables.renderOrders == null && drawables.drawOrders != null) {
      Object.defineProperty(drawables, "renderOrders", {
        configurable: true,
        enumerable: true,
        get() {
          return this.drawOrders;
        },
      });
    }
    return model;
  };

  const originalFromMoc = Core.Model.fromMoc.bind(Core.Model);
  Core.Model.fromMoc = function patchedFromMoc(moc) {
    return patchDrawables(originalFromMoc(moc));
  };

  console.info("[Enerva] Cubism renderOrders compatibility patch applied");
})();
